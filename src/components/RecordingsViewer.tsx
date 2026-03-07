import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Video, Download, Play, Loader2, Film, Layers } from 'lucide-react';
import { formatDistanceToNow, format, differenceInMinutes } from 'date-fns';
import { sv } from 'date-fns/locale';

interface Recording {
  id: string;
  storage_path: string;
  captured_at: string;
  competitor_id: string;
}

interface RecordingSession {
  id: string;
  startTime: Date;
  endTime: Date;
  recordings: Recording[];
  duration: number; // in minutes
}

interface RecordingsViewerProps {
  competitorId: string;
  competitorName: string;
  onClose: () => void;
}

// Group recordings into sessions (segments within 2 minutes of each other)
const groupIntoSessions = (recordings: Recording[]): RecordingSession[] => {
  if (recordings.length === 0) return [];

  // Sort by time ascending
  const sorted = [...recordings].sort(
    (a, b) => new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime()
  );

  const sessions: RecordingSession[] = [];
  let currentSession: Recording[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prevTime = new Date(sorted[i - 1].captured_at);
    const currTime = new Date(sorted[i].captured_at);
    const gap = differenceInMinutes(currTime, prevTime);

    // If gap is more than 2 minutes, start a new session
    if (gap > 2) {
      const startTime = new Date(currentSession[0].captured_at);
      const endTime = new Date(currentSession[currentSession.length - 1].captured_at);
      sessions.push({
        id: currentSession[0].id,
        startTime,
        endTime,
        recordings: currentSession,
        duration: Math.max(1, differenceInMinutes(endTime, startTime) + 1),
      });
      currentSession = [sorted[i]];
    } else {
      currentSession.push(sorted[i]);
    }
  }

  // Add last session
  if (currentSession.length > 0) {
    const startTime = new Date(currentSession[0].captured_at);
    const endTime = new Date(currentSession[currentSession.length - 1].captured_at);
    sessions.push({
      id: currentSession[0].id,
      startTime,
      endTime,
      recordings: currentSession,
      duration: Math.max(1, differenceInMinutes(endTime, startTime) + 1),
    });
  }

  // Return in reverse chronological order
  return sessions.reverse();
};

export const RecordingsViewer = ({ competitorId, competitorName, onClose }: RecordingsViewerProps) => {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [sessions, setSessions] = useState<RecordingSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState<RecordingSession | null>(null);
  const [loadingVideo, setLoadingVideo] = useState(false);
  const [loadProgress, setLoadProgress] = useState<string>('');
  const [currentSegment, setCurrentSegment] = useState(0);
  const [totalSegments, setTotalSegments] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const segmentBlobsRef = useRef<Map<number, Blob>>(new Map());
  const signedUrlsRef = useRef<string[]>([]);
  const isLoadingSegmentRef = useRef<Set<number>>(new Set());
  const currentBlobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    const fetchRecordings = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('screenshots')
        .select('*')
        .eq('competitor_id', competitorId)
        .order('captured_at', { ascending: false });

      if (error) {
        console.error('Error fetching recordings:', error);
      } else {
        setRecordings(data || []);
        setSessions(groupIntoSessions(data || []));
      }
      setLoading(false);
    };

    fetchRecordings();
  }, [competitorId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (currentBlobUrlRef.current) {
        URL.revokeObjectURL(currentBlobUrlRef.current);
      }
    };
  }, []);

  // Fetch segment blob with lazy loading
  const fetchSegmentBlob = useCallback(async (index: number): Promise<Blob | null> => {
    // Return cached blob if available
    if (segmentBlobsRef.current.has(index)) {
      return segmentBlobsRef.current.get(index)!;
    }

    // Skip if already loading
    if (isLoadingSegmentRef.current.has(index)) {
      return null;
    }

    const url = signedUrlsRef.current[index];
    if (!url) return null;

    isLoadingSegmentRef.current.add(index);

    try {
      const response = await fetch(url);
      const blob = await response.blob();
      segmentBlobsRef.current.set(index, blob);
      isLoadingSegmentRef.current.delete(index);
      return blob;
    } catch (err) {
      console.error(`Error fetching segment ${index}:`, err);
      isLoadingSegmentRef.current.delete(index);
      return null;
    }
  }, []);

  // Preload next segments in background
  const preloadSegments = useCallback(async (currentIndex: number) => {
    // Preload next 2 segments
    const preloadCount = 2;
    for (let i = 1; i <= preloadCount; i++) {
      const nextIndex = currentIndex + i;
      if (nextIndex < signedUrlsRef.current.length && !segmentBlobsRef.current.has(nextIndex)) {
        fetchSegmentBlob(nextIndex);
      }
    }
  }, [fetchSegmentBlob]);

  // Play a specific segment
  const playSegment = useCallback(async (index: number) => {
    if (index >= signedUrlsRef.current.length) {
      setIsPlaying(false);
      return;
    }

    setCurrentSegment(index);
    
    // Revoke old blob URL
    if (currentBlobUrlRef.current) {
      URL.revokeObjectURL(currentBlobUrlRef.current);
      currentBlobUrlRef.current = null;
    }

    // Get or fetch the segment
    let blob = segmentBlobsRef.current.get(index);
    if (!blob) {
      setLoadProgress(`Laddar segment ${index + 1}...`);
      blob = await fetchSegmentBlob(index);
      setLoadProgress('');
    }

    if (!blob) {
      console.error('No blob for segment', index);
      return;
    }

    // Create blob URL
    const blobUrl = URL.createObjectURL(blob);
    currentBlobUrlRef.current = blobUrl;
    
    // Wait for video element to be available
    const video = videoRef.current;
    if (!video) {
      console.error('No video element');
      return;
    }

    // Set up load handler before setting src
    const handleCanPlay = async () => {
      video.removeEventListener('canplay', handleCanPlay);
      try {
        await video.play();
        setIsPlaying(true);
      } catch (err) {
        // Autoplay might be blocked - that's ok, user can click play
        console.log('Autoplay blocked, user can click play:', err);
        setIsPlaying(false);
      }
    };

    video.addEventListener('canplay', handleCanPlay);
    video.src = blobUrl;
    video.load(); // Explicitly load the new source

    // Preload next segments
    preloadSegments(index);
  }, [fetchSegmentBlob, preloadSegments]);

  // Handle video ended - auto play next segment
  const handleVideoEnded = useCallback(() => {
    const nextIndex = currentSegment + 1;
    if (nextIndex < signedUrlsRef.current.length) {
      playSegment(nextIndex);
    } else {
      setIsPlaying(false);
    }
  }, [currentSegment, playSegment]);

  // Load session - get signed URLs only (lazy load blobs)
  const loadSession = useCallback(async (session: RecordingSession) => {
    setLoadingVideo(true);
    setSelectedSession(session);
    setCurrentSegment(0);
    setTotalSegments(session.recordings.length);
    setLoadProgress('Hämtar video-länkar...');

    // Clear cached blobs
    segmentBlobsRef.current.clear();
    isLoadingSegmentRef.current.clear();
    signedUrlsRef.current = [];

    if (currentBlobUrlRef.current) {
      URL.revokeObjectURL(currentBlobUrlRef.current);
      currentBlobUrlRef.current = null;
    }

    try {
      const urls: string[] = [];
      
      // Get all signed URLs in parallel
      const urlPromises = session.recordings.map(async (recording) => {
        const { data } = await supabase.storage
          .from('screenshots')
          .createSignedUrl(recording.storage_path, 3600);
        return data?.signedUrl || null;
      });

      const results = await Promise.all(urlPromises);
      results.forEach(url => {
        if (url) urls.push(url);
      });

      if (urls.length === 0) {
        setLoadProgress('Inga segment kunde laddas');
        setLoadingVideo(false);
        return;
      }

      signedUrlsRef.current = urls;
      setTotalSegments(urls.length);

      // Preload first segment
      setLoadProgress('Laddar första segmentet...');
      await fetchSegmentBlob(0);
      
      setLoadProgress('');
      setLoadingVideo(false);

      // Auto-play first segment
      playSegment(0);
    } catch (err) {
      console.error('Error loading session:', err);
      setLoadProgress('Fel vid laddning');
      setLoadingVideo(false);
    }
  }, [fetchSegmentBlob, playSegment]);

  const downloadAllSegments = useCallback(async () => {
    if (!selectedSession) return;

    for (let i = 0; i < signedUrlsRef.current.length; i++) {
      // Reuse cached blob or fetch it
      let blob = segmentBlobsRef.current.get(i);
      if (!blob) {
        const response = await fetch(signedUrlsRef.current[i]);
        blob = await response.blob();
      }

      const fileName = `${competitorName}-${format(selectedSession.startTime, 'yyyy-MM-dd-HH-mm')}-segment-${i + 1}.webm`;
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = fileName;
      link.rel = 'noopener';
      link.target = '_blank';
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Delay revoke so browsers have time to start the download
      setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);

      // Small delay between downloads
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }, [selectedSession, competitorName]);

  // Calculate total playback position for timeline
  const getTimelinePosition = useCallback(() => {
    if (!videoRef.current || totalSegments === 0) return 0;
    const segmentProgress = (videoRef.current.currentTime / (videoRef.current.duration || 1));
    return ((currentSegment + segmentProgress) / totalSegments) * 100;
  }, [currentSegment, totalSegments]);

  // Seek to segment by clicking timeline
  const handleTimelineClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickPosition = (e.clientX - rect.left) / rect.width;
    const targetSegment = Math.floor(clickPosition * totalSegments);
    if (targetSegment >= 0 && targetSegment < totalSegments) {
      playSegment(targetSegment);
    }
  }, [totalSegments, playSegment]);

  return (
    <div
      className="fixed inset-0 bg-background/95 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <Card className="glass-panel flex-1 flex flex-col overflow-hidden">
          <CardHeader className="flex-shrink-0">
            <div className="flex items-center justify-between">
              <CardTitle className="text-foreground flex items-center gap-2">
                <Video className="h-5 w-5 text-primary" />
                Inspelningar - {competitorName}
              </CardTitle>
              <button
                onClick={onClose}
                className="text-muted-foreground hover:text-foreground text-2xl"
              >
                ×
              </button>
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden flex gap-4">
            {/* Session list */}
            <div className="w-72 flex-shrink-0 overflow-y-auto border-r border-border pr-4">
              <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                <Film className="h-4 w-4" />
                {sessions.length} sessioner ({recordings.length} segment)
              </h3>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : sessions.length === 0 ? (
                <p className="text-sm text-muted-foreground">Inga inspelningar hittades</p>
              ) : (
                <div className="space-y-2">
                  {sessions.map((session) => (
                    <div
                      key={session.id}
                      className={`p-3 rounded-lg cursor-pointer transition-colors ${
                        selectedSession?.id === session.id
                          ? 'bg-primary/10 border border-primary/30'
                          : 'bg-secondary/50 hover:bg-secondary'
                      }`}
                      onClick={() => loadSession(session)}
                    >
                      <div className="flex items-center gap-2">
                        <Play className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium text-foreground">
                          {format(session.startTime, 'HH:mm')} - {format(session.endTime, 'HH:mm')}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {format(session.startTime, 'd MMM yyyy', { locale: sv })}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Layers className="h-3 w-3" />
                          {session.recordings.length} segment
                        </span>
                        <span className="text-xs text-muted-foreground">
                          ~{session.duration} min
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDistanceToNow(session.startTime, { addSuffix: true, locale: sv })}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Video player */}
            <div className="flex-1 flex flex-col">
              {selectedSession ? (
                <>
                  <div className="flex-1 bg-black rounded-lg overflow-hidden relative min-h-[400px]">
                    {loadingVideo ? (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        <p className="text-sm text-muted-foreground">{loadProgress}</p>
                      </div>
                    ) : (
                      <>
                        <video
                          ref={videoRef}
                          controls
                          onEnded={handleVideoEnded}
                          onPlay={() => setIsPlaying(true)}
                          onPause={() => setIsPlaying(false)}
                          className="w-full h-full object-contain"
                        />
                        {loadProgress && (
                          <div className="absolute top-4 right-4 bg-background/80 px-3 py-1 rounded text-sm text-muted-foreground flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            {loadProgress}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Unified timeline */}
                  <div className="mt-4">
                    <div 
                      className="h-2 bg-secondary rounded-full cursor-pointer overflow-hidden relative"
                      onClick={handleTimelineClick}
                    >
                      {/* Segment markers */}
                      {Array.from({ length: totalSegments }).map((_, i) => (
                        <div
                          key={i}
                          className="absolute top-0 bottom-0 w-px bg-border/50"
                          style={{ left: `${(i / totalSegments) * 100}%` }}
                        />
                      ))}
                      {/* Progress bar - we'll use a simple segment indicator */}
                      <div 
                        className="h-full bg-primary transition-all duration-100"
                        style={{ width: `${((currentSegment + 1) / totalSegments) * 100}%` }}
                      />
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="text-xs text-muted-foreground">
                        Segment {currentSegment + 1} av {totalSegments}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {isPlaying ? 'Spelar' : 'Pausad'} • Fortsätter automatiskt
                      </span>
                    </div>
                  </div>

                  {/* Download button */}
                  <div className="flex items-center justify-end mt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={downloadAllSegments}
                      disabled={totalSegments === 0}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Ladda ner alla segment
                    </Button>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <Video className="h-16 w-16 mx-auto mb-4 opacity-50" />
                    <p>Välj en session för att spela upp</p>
                    <p className="text-sm mt-2">Segmenten spelas som en kontinuerlig video</p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
