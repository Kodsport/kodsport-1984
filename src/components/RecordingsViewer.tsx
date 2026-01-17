import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Video, Download, Play, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { sv } from 'date-fns/locale';

interface Recording {
  id: string;
  storage_path: string;
  captured_at: string;
  competitor_id: string;
}

interface RecordingsViewerProps {
  competitorId: string;
  competitorName: string;
  onClose: () => void;
}

export const RecordingsViewer = ({ competitorId, competitorName, onClose }: RecordingsViewerProps) => {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRecording, setSelectedRecording] = useState<Recording | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loadingVideo, setLoadingVideo] = useState(false);

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
      }
      setLoading(false);
    };

    fetchRecordings();
  }, [competitorId]);

  const loadVideo = async (recording: Recording) => {
    setLoadingVideo(true);
    setSelectedRecording(recording);

    const { data } = await supabase.storage
      .from('screenshots')
      .createSignedUrl(recording.storage_path, 3600); // 1 hour expiry

    if (data?.signedUrl) {
      setVideoUrl(data.signedUrl);
    }
    setLoadingVideo(false);
  };

  const downloadRecording = async (recording: Recording) => {
    const { data } = await supabase.storage
      .from('screenshots')
      .createSignedUrl(recording.storage_path, 60);

    if (data?.signedUrl) {
      const link = document.createElement('a');
      link.href = data.signedUrl;
      link.download = `${competitorName}-${format(new Date(recording.captured_at), 'yyyy-MM-dd-HH-mm')}.webm`;
      link.click();
    }
  };

  const currentIndex = selectedRecording 
    ? recordings.findIndex(r => r.id === selectedRecording.id) 
    : -1;

  const goToPrevious = () => {
    if (currentIndex > 0) {
      loadVideo(recordings[currentIndex - 1]);
    }
  };

  const goToNext = () => {
    if (currentIndex < recordings.length - 1) {
      loadVideo(recordings[currentIndex + 1]);
    }
  };

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
            {/* Recording list */}
            <div className="w-64 flex-shrink-0 overflow-y-auto border-r border-border pr-4">
              <h3 className="text-sm font-medium text-muted-foreground mb-3">
                {recordings.length} inspelningar
              </h3>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : recordings.length === 0 ? (
                <p className="text-sm text-muted-foreground">Inga inspelningar hittades</p>
              ) : (
                <div className="space-y-2">
                  {recordings.map((recording) => (
                    <div
                      key={recording.id}
                      className={`p-3 rounded-lg cursor-pointer transition-colors ${
                        selectedRecording?.id === recording.id
                          ? 'bg-primary/10 border border-primary/30'
                          : 'bg-secondary/50 hover:bg-secondary'
                      }`}
                      onClick={() => loadVideo(recording)}
                    >
                      <div className="flex items-center gap-2">
                        <Play className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium text-foreground">
                          {format(new Date(recording.captured_at), 'HH:mm:ss')}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {format(new Date(recording.captured_at), 'd MMM yyyy', { locale: sv })}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(recording.captured_at), { addSuffix: true, locale: sv })}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Video player */}
            <div className="flex-1 flex flex-col">
              {selectedRecording ? (
                <>
                  <div className="flex-1 bg-black rounded-lg overflow-hidden relative">
                    {loadingVideo ? (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      </div>
                    ) : videoUrl ? (
                      <video
                        key={videoUrl}
                        src={videoUrl}
                        controls
                        autoPlay
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
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={goToPrevious}
                        disabled={currentIndex <= 0}
                      >
                        <ChevronLeft className="h-4 w-4 mr-1" />
                        Föregående
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={goToNext}
                        disabled={currentIndex >= recordings.length - 1}
                      >
                        Nästa
                        <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                    </div>

                    <div className="text-sm text-muted-foreground">
                      {currentIndex + 1} av {recordings.length}
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => downloadRecording(selectedRecording)}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Ladda ner
                    </Button>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <Video className="h-16 w-16 mx-auto mb-4 opacity-50" />
                    <p>Välj en inspelning för att spela upp</p>
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
