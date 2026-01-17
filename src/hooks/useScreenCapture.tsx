import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

interface ScreenCaptureState {
  isCapturing: boolean;
  stream: MediaStream | null;
  competitorId: string | null;
  error: string | null;
  captureCount: number;
}

export const useScreenCapture = () => {
  const { user } = useAuth();
  const [state, setState] = useState<ScreenCaptureState>({
    isCapturing: false,
    stream: null,
    competitorId: null,
    error: null,
    captureCount: 0,
  });

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const compressImage = useCallback(async (
    video: HTMLVideoElement,
    canvas: HTMLCanvasElement,
    maxWidth: number = 1280,
    quality: number = 0.5
  ): Promise<Blob | null> => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const originalWidth = video.videoWidth;
    const originalHeight = video.videoHeight;

    // Calculate scaled dimensions while maintaining aspect ratio
    let targetWidth = originalWidth;
    let targetHeight = originalHeight;

    if (originalWidth > maxWidth) {
      const scale = maxWidth / originalWidth;
      targetWidth = maxWidth;
      targetHeight = Math.round(originalHeight * scale);
    }

    // Set canvas to target dimensions
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    // Draw scaled image
    ctx.drawImage(video, 0, 0, targetWidth, targetHeight);

    // Convert to compressed JPEG blob
    return new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', quality);
    });
  }, []);

  const captureAndUpload = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || !user || !state.competitorId) {
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;

    // Compress image: scale to max 1280px width, 50% JPEG quality
    const blob = await compressImage(video, canvas, 1280, 0.5);

    if (!blob) return;

    // Generate unique filename
    const timestamp = Date.now();
    const fileName = `${user.id}/${state.competitorId}/${timestamp}.jpg`;

    // Upload to storage
    const { error: uploadError } = await supabase.storage
      .from('screenshots')
      .upload(fileName, blob, {
        contentType: 'image/jpeg',
        cacheControl: '3600',
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return;
    }

    // Record in database
    await supabase.from('screenshots').insert({
      competitor_id: state.competitorId,
      storage_path: fileName,
      captured_at: new Date().toISOString(),
    });

    // Update last_seen
    await supabase
      .from('competitors')
      .update({ last_seen: new Date().toISOString(), status: 'online' })
      .eq('id', state.competitorId);

    setState((prev) => ({ ...prev, captureCount: prev.captureCount + 1 }));
  }, [user, state.competitorId, compressImage]);

  const startCapture = async (room: string = 'Rum 41') => {
    if (!user) {
      setState((prev) => ({ ...prev, error: 'Must be logged in to start capture' }));
      return;
    }

    // Get name from user metadata
    const name = user.user_metadata?.name || user.email?.split('@')[0] || 'Unknown';

    try {
      // Request screen capture
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'monitor',
        },
        audio: false,
      });

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

      setState({
        isCapturing: true,
        stream,
        competitorId: competitor.id,
        error: null,
        captureCount: 0,
      });

      // Handle stream ending (user clicks "Stop sharing")
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

  const stopCapture = async () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
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
      captureCount: 0,
    });
  };

  // Start interval when capturing begins
  useEffect(() => {
    if (state.isCapturing && state.competitorId) {
      // Capture immediately on start
      captureAndUpload();

      // Then capture every second
      intervalRef.current = setInterval(captureAndUpload, 1000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [state.isCapturing, state.competitorId, captureAndUpload]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (state.stream) {
        state.stream.getTracks().forEach((track) => track.stop());
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    ...state,
    startCapture,
    stopCapture,
  };
};
