import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Video, Download, Play, Loader2, Film, Layers, SkipBack, SkipForward } from 'lucide-react';
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
  const [segmentUrls, setSegmentUrls] = useState<string[]>([]);
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);
  const [loadingVideo, setLoadingVideo] = useState(false);
  const [mergeProgress, setMergeProgress] = useState<string>('');
  const videoRef = useRef<HTMLVideoElement>(null);

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

  // Load all segment URLs for a session and play them sequentially
  const loadSession = useCallback(async (session: RecordingSession) => {
    setLoadingVideo(true);
    setSelectedSession(session);
    setCurrentSegmentIndex(0);
    setMergeProgress(`Laddar ${session.recordings.length} segment...`);

    // Cleanup old URLs
    segmentUrls.forEach(url => URL.revokeObjectURL(url));
    setSegmentUrls([]);

    try {
      const urls: string[] = [];
      
      for (let i = 0; i < session.recordings.length; i++) {
        const recording = session.recordings[i];
        setMergeProgress(`Laddar segment ${i + 1} av ${session.recordings.length}...`);
        
        const { data } = await supabase.storage
          .from('screenshots')
          .createSignedUrl(recording.storage_path, 3600); // 1 hour validity

        if (data?.signedUrl) {
          urls.push(data.signedUrl);
        }
      }

      if (urls.length === 0) {
        setMergeProgress('Inga segment kunde laddas');
        setLoadingVideo(false);
        return;
      }

      setSegmentUrls(urls);
      setMergeProgress('');
    } catch (err) {
      console.error('Error loading session:', err);
      setMergeProgress('Fel vid laddning');
    }

    setLoadingVideo(false);
  }, [segmentUrls]);

  // Handle video ended - play next segment
  const handleVideoEnded = useCallback(() => {
    if (currentSegmentIndex < segmentUrls.length - 1) {
      setCurrentSegmentIndex(prev => prev + 1);
    }
  }, [currentSegmentIndex, segmentUrls.length]);

  // Auto-play when segment changes
  useEffect(() => {
    if (videoRef.current && segmentUrls[currentSegmentIndex]) {
      videoRef.current.play().catch(() => {});
    }
  }, [currentSegmentIndex, segmentUrls]);

  const goToPreviousSegment = () => {
    if (currentSegmentIndex > 0) {
      setCurrentSegmentIndex(prev => prev - 1);
    }
  };

  const goToNextSegment = () => {
    if (currentSegmentIndex < segmentUrls.length - 1) {
      setCurrentSegmentIndex(prev => prev + 1);
    }
  };

  const downloadCurrentSegment = useCallback(async () => {
    if (!selectedSession || !segmentUrls[currentSegmentIndex]) return;

    const link = document.createElement('a');
    link.href = segmentUrls[currentSegmentIndex];
    link.download = `${competitorName}-${format(selectedSession.startTime, 'yyyy-MM-dd-HH-mm')}-segment-${currentSegmentIndex + 1}.webm`;
    link.click();
  }, [selectedSession, segmentUrls, currentSegmentIndex, competitorName]);

  // Cleanup URLs on unmount
  useEffect(() => {
    return () => {
      segmentUrls.forEach(url => {
        if (url.startsWith('blob:')) {
          URL.revokeObjectURL(url);
        }
      });
    };
  }, [segmentUrls]);

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
                        <p className="text-sm text-muted-foreground">{mergeProgress}</p>
                      </div>
                    ) : segmentUrls.length > 0 ? (
                      <video
                        ref={videoRef}
                        key={segmentUrls[currentSegmentIndex]}
                        src={segmentUrls[currentSegmentIndex]}
                        controls
                        autoPlay
                        onEnded={handleVideoEnded}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                        Kunde inte ladda videon
                      </div>
                    )}
                  </div>

                  {/* Controls */}
                  <div className="flex items-center justify-between mt-4">
                    <div className="text-sm text-muted-foreground">
                      Segment {currentSegmentIndex + 1} av {segmentUrls.length}
                      <span className="ml-2 text-xs">
                        (Spelar automatiskt nästa segment)
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={goToPreviousSegment}
                        disabled={currentSegmentIndex === 0}
                      >
                        <SkipBack className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={goToNextSegment}
                        disabled={currentSegmentIndex >= segmentUrls.length - 1}
                      >
                        <SkipForward className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={downloadCurrentSegment}
                        disabled={!segmentUrls[currentSegmentIndex]}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Ladda ner
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <Video className="h-16 w-16 mx-auto mb-4 opacity-50" />
                    <p>Välj en session för att spela upp</p>
                    <p className="text-sm mt-2">Segmenten spelas i sekvens</p>
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
