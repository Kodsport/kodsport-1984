import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import fixWebmDuration from 'fix-webm-duration';

interface ScreenCaptureState {
  isCapturing: boolean;
  stream: MediaStream | null;
  competitorId: string | null;
  error: string | null;
  startTime: number | null;
}

const VIDEO_SEGMENT_DURATION_MS = 60000; // 1 minute per video segment
const BROADCAST_INTERVAL_MS = 500; // Broadcast every 0.5 seconds (twice per second)
const HEARTBEAT_INTERVAL_MS = 10000; // Update last_seen every 10 seconds (REST API call)
const VIDEO_FPS = 5; // 5 frames per second for video recording

export const useScreenCapture = () => {
  const { user } = useAuth();
  const [state, setState] = useState<ScreenCaptureState>({
    isCapturing: false,
    stream: null,
    competitorId: null,
    error: null,
    startTime: null,
  });

  const broadcastIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const videoSegmentStartRef = useRef<number>(0);
  const videoIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const segmentTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const isRecordingRef = useRef<boolean>(false);

  // Capture image for broadcast (high quality for readability)
  const captureImageForBroadcast = useCallback(async (
    video: HTMLVideoElement,
    canvas: HTMLCanvasElement,
    maxWidth: number = 1920,
    quality: number = 0.85
  ): Promise<string | null> => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const originalWidth = video.videoWidth;
    const originalHeight = video.videoHeight;

    let targetWidth = originalWidth;
    let targetHeight = originalHeight;

    if (originalWidth > maxWidth) {
      const scale = maxWidth / originalWidth;
      targetWidth = maxWidth;
      targetHeight = Math.round(originalHeight * scale);
    }

    canvas.width = targetWidth;
    canvas.height = targetHeight;
    ctx.drawImage(video, 0, 0, targetWidth, targetHeight);

    // Return as base64 for broadcast - higher quality PNG for better text readability
    return canvas.toDataURL('image/png');
  }, []);

  // Broadcast screenshot to admins via Supabase Realtime
  const broadcastScreenshot = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || !user || !state.competitorId) {
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;

    const imageData = await captureImageForBroadcast(video, canvas, 1920, 0.85);
    if (!imageData) return;

    // Broadcast via Supabase Realtime channel (WebSocket, not REST API)
    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'screenshot',
        payload: {
          competitorId: state.competitorId,
          userId: user.id,
          imageData,
          timestamp: Date.now(),
        },
      });
    }
  }, [user, state.competitorId, captureImageForBroadcast]);

  // Send heartbeat to update last_seen (REST API call, runs less frequently)
  const sendHeartbeat = useCallback(async () => {
    if (!state.competitorId) return;

    await supabase
      .from('competitors')
      .update({ last_seen: new Date().toISOString(), status: 'online' })
      .eq('id', state.competitorId);
  }, [state.competitorId]);

  // Draw frame to recording canvas at higher quality
  const drawFrameToRecordingCanvas = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size for video recording (full resolution up to 1920px)
    const maxWidth = 1920;
    let targetWidth = video.videoWidth;
    let targetHeight = video.videoHeight;

    if (targetWidth > maxWidth) {
      const scale = maxWidth / targetWidth;
      targetWidth = maxWidth;
      targetHeight = Math.round(video.videoHeight * scale);
    }

    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }

    ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
  }, []);

  // Upload video segment to storage
  const uploadVideoSegment = useCallback(async (blob: Blob, segmentStart: number, duration: number) => {
    if (!user || !state.competitorId) return;

    try {
      // Fix the WebM duration metadata issue
      const fixedBlob = await fixWebmDuration(blob, duration, { logger: false });
      
      const timestamp = segmentStart;
      const fileName = `${user.id}/${state.competitorId}/${timestamp}.webm`;

      const { error: uploadError } = await supabase.storage
        .from('screenshots')
        .upload(fileName, fixedBlob, {
          contentType: 'video/webm',
          cacheControl: '3600',
        });

      if (uploadError) {
        console.error('Video upload error:', uploadError);
        return;
      }

      // Record in database
      await supabase.from('screenshots').insert({
        competitor_id: state.competitorId,
        storage_path: fileName,
        captured_at: new Date(segmentStart).toISOString(),
      });

      console.log('Video segment uploaded:', fileName, 'duration:', duration, 'ms');
    } catch (err) {
      console.error('Error fixing/uploading video:', err);
    }
  }, [user, state.competitorId]);

  // Start a new video recording segment
  const startVideoSegment = useCallback(() => {
    if (!canvasRef.current || isRecordingRef.current) return;
    
    isRecordingRef.current = true;

    const canvas = canvasRef.current;
    
    // Capture stream at 1 FPS
    const stream = canvas.captureStream(VIDEO_FPS);
    
    // Check codec support and fallback
    let mimeType = 'video/webm;codecs=vp9';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/webm;codecs=vp8';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm';
      }
    }
    
    const mediaRecorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 1000000, // 1 Mbps for lower storage usage
    });

    recordedChunksRef.current = [];
    const segmentStartTime = Date.now();
    videoSegmentStartRef.current = segmentStartTime;

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        recordedChunksRef.current.push(e.data);
      }
    };

    mediaRecorder.onstop = async () => {
      isRecordingRef.current = false;
      if (recordedChunksRef.current.length > 0) {
        const duration = Date.now() - segmentStartTime;
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        await uploadVideoSegment(blob, segmentStartTime, duration);
      }
    };

    mediaRecorder.start(500); // Collect data every 0.5 seconds
    mediaRecorderRef.current = mediaRecorder;

    // Draw frames at 5 FPS for the video (every 200ms)
    videoIntervalRef.current = setInterval(drawFrameToRecordingCanvas, 200);

    // Schedule segment end after 1 minute
    segmentTimeoutRef.current = setTimeout(() => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
        if (videoIntervalRef.current) {
          clearInterval(videoIntervalRef.current);
          videoIntervalRef.current = null;
        }
        // Start new segment if still capturing
        if (state.isCapturing) {
          // Small delay before starting next segment
          setTimeout(() => startVideoSegment(), 100);
        }
      }
    }, VIDEO_SEGMENT_DURATION_MS);
  }, [drawFrameToRecordingCanvas, uploadVideoSegment, state.isCapturing]);

  const startCapture = async (room: string = 'Kammaren') => {
    if (!user) {
      setState((prev) => ({ ...prev, error: 'Must be logged in to start capture' }));
      return;
    }

    const name = user.user_metadata?.name || user.email?.split('@')[0] || 'Unknown';

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'monitor',
        },
        audio: false,
      });

      // Check if user selected entire screen (monitor)
      // Note: Firefox doesn't support displaySurface in getSettings(), so we check for support first
      const track = stream.getVideoTracks()[0];
      const settings = track.getSettings();
      const displaySurface = (settings as { displaySurface?: string }).displaySurface;
      
      // Check if displaySurface is supported (Chrome, Safari, Edge support it; Firefox doesn't)
      const supportsDisplaySurface = 'displaySurface' in settings;
      
      if (supportsDisplaySurface && displaySurface !== 'monitor') {
        // Browser supports detection and user didn't select full screen
        stream.getTracks().forEach((t) => t.stop());
        setState((prev) => ({
          ...prev,
          error: 'Du måste välja "Hela skärmen" för att delta. Försök igen och välj hela skärmen.',
        }));
        return;
      }
      
      // For Firefox: We can't detect the surface type, but we request 'monitor' preference
      // and show a warning. The getDisplayMedia call with displaySurface: 'monitor' 
      // will still show the picker, but Firefox may not respect the preference.
      // We'll trust the user selected correctly on Firefox.

      // Create video element
      const video = document.createElement('video');
      video.srcObject = stream;
      video.autoplay = true;
      video.playsInline = true;
      await video.play();
      videoRef.current = video;

      // Create canvas for capturing frames
      const canvas = document.createElement('canvas');
      canvasRef.current = canvas;

      // Generate session ID
      const sessionId = `${user.id}-${Date.now()}`;

      // Create competitor record
      const { data: competitor, error: competitorError } = await supabase
        .from('competitors')
        .insert({
          user_id: user.id,
          name,
          room,
          session_id: sessionId,
          status: 'online',
          started_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (competitorError) {
        throw competitorError;
      }

      // Create broadcast channel for live screenshots
      const channel = supabase.channel(`live-screenshots-${room}`, {
        config: {
          broadcast: { self: false },
        },
      });
      await channel.subscribe();
      channelRef.current = channel;

      setState({
        isCapturing: true,
        stream,
        competitorId: competitor.id,
        error: null,
        startTime: Date.now(),
      });

      // Handle stream ending
      stream.getVideoTracks()[0].onended = () => {
        stopCapture();
      };
    } catch (err) {
      console.error('Screen capture error:', err);
      setState((prev) => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Failed to start screen capture',
      }));
    }
  };

  const stopCapture = async (notifyAdmins: boolean = true, room?: string) => {
    // Stop broadcast interval
    if (broadcastIntervalRef.current) {
      clearInterval(broadcastIntervalRef.current);
      broadcastIntervalRef.current = null;
    }

    // Stop heartbeat interval
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }

    // Stop segment timeout
    if (segmentTimeoutRef.current) {
      clearTimeout(segmentTimeoutRef.current);
      segmentTimeoutRef.current = null;
    }

    // Stop video recording
    if (videoIntervalRef.current) {
      clearInterval(videoIntervalRef.current);
      videoIntervalRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    
    isRecordingRef.current = false;

    // Broadcast stop event to admins via realtime (for in-app notifications)
    if (notifyAdmins && state.competitorId && user) {
      const name = user.user_metadata?.name || user.email?.split('@')[0] || 'Unknown';

      const alertChannel = supabase.channel('admin-alerts');
      await alertChannel.subscribe();
      
      alertChannel.send({
        type: 'broadcast',
        event: 'alert',
        payload: {
          type: 'stopped',
          competitorId: state.competitorId,
          competitorName: name,
          room: room || 'Unknown',
          timestamp: Date.now(),
          message: `${name} stoppade sin skärminspelning`,
        },
      });

      setTimeout(() => supabase.removeChannel(alertChannel), 1000);
    }

    // Unsubscribe from channel
    if (channelRef.current) {
      await supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    if (state.stream) {
      state.stream.getTracks().forEach((track) => track.stop());
    }

    if (state.competitorId) {
      await supabase
        .from('competitors')
        .update({
          status: 'offline',
          ended_at: new Date().toISOString(),
        })
        .eq('id', state.competitorId);
    }

    videoRef.current = null;
    canvasRef.current = null;

    setState({
      isCapturing: false,
      stream: null,
      competitorId: null,
      error: null,
      startTime: null,
    });
  };

  // Start broadcast and video recording when capturing begins
  useEffect(() => {
    if (state.isCapturing && state.competitorId) {
      // Draw initial frame
      drawFrameToRecordingCanvas();

      // Start broadcasting screenshots every second
      broadcastScreenshot();
      broadcastIntervalRef.current = setInterval(broadcastScreenshot, BROADCAST_INTERVAL_MS);

      // Start video recording
      startVideoSegment();
    }

    return () => {
      if (broadcastIntervalRef.current) {
        clearInterval(broadcastIntervalRef.current);
      }
      if (videoIntervalRef.current) {
        clearInterval(videoIntervalRef.current);
      }
    };
  }, [state.isCapturing, state.competitorId, broadcastScreenshot, startVideoSegment, drawFrameToRecordingCanvas]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (state.stream) {
        state.stream.getTracks().forEach((track) => track.stop());
      }
      if (broadcastIntervalRef.current) {
        clearInterval(broadcastIntervalRef.current);
      }
      if (videoIntervalRef.current) {
        clearInterval(videoIntervalRef.current);
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, []);

  return {
    ...state,
    startCapture,
    stopCapture,
  };
};
