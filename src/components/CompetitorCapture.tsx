import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useScreenCapture } from '@/hooks/useScreenCapture';
import { useAuth } from '@/hooks/useAuth';
import { useDevToolsDetection } from '@/hooks/useDevToolsDetection';
import { supabase } from '@/integrations/supabase/client';
import { Monitor, MonitorOff, AlertCircle, CheckCircle, Camera, DoorOpen, User, ShieldAlert } from 'lucide-react';
import { useRooms } from '@/hooks/useRooms';

export const CompetitorCapture = () => {
  const [room, setRoom] = useState<string>('');
  const { roomNames, loading: roomsLoading } = useRooms();
  const [elapsedTime, setElapsedTime] = useState(0);
  const { isCapturing, error, startTime, competitorId, startCapture, stopCapture } = useScreenCapture();
  const { user } = useAuth();

  const userName = user?.user_metadata?.name || user?.email?.split('@')[0] || 'Participant';

  const handleDevToolsDetected = useCallback(async () => {
    if (!competitorId) return;

    try {
      await supabase.functions.invoke('discord-alert', {
        body: {
          type: 'devtools',
          competitorId,
        },
      });
    } catch (err) {
      console.error('Failed to send Discord alert:', err);
    }
  }, [competitorId]);

  const { hasBeenOpened } = useDevToolsDetection({
    onDetected: handleDevToolsDetected,
  });

  useEffect(() => {
    if (!isCapturing || !startTime) {
      setElapsedTime(0);
      return;
    }

    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [isCapturing, startTime]);

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleStart = () => {
    if (room) {
      startCapture(room);
    }
  };

  return (
    <div className="space-y-6">
      {hasBeenOpened && (
        <Alert variant="destructive" className="border-destructive bg-destructive/10">
          <ShieldAlert className="h-5 w-5" />
          <AlertTitle className="font-bold">Warning: Developer tools detected!</AlertTitle>
          <AlertDescription className="mt-2">
            <p>Using developer tools (Inspect Element) is not allowed during the competition.</p>
            <p className="mt-1 font-medium">This event has been logged and will be reviewed by competition officials.</p>
          </AlertDescription>
        </Alert>
      )}

      <Card className="glass-panel card-elevated">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <Camera className="h-5 w-5 text-primary" />
            Screen Monitoring
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Start screen recording to monitor your session during the competition
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isCapturing ? (
            <>
              <div className="flex items-center gap-3 p-3 bg-secondary/50 rounded-lg border border-border">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-foreground">{userName}</p>
                  <p className="text-xs text-muted-foreground">{user?.email}</p>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground flex items-center gap-2">
                  <DoorOpen className="h-4 w-4 text-muted-foreground" />
                  Select your room
                </label>
                <Select value={room} onValueChange={setRoom} disabled={roomsLoading}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={roomsLoading ? 'Loading rooms...' : 'Select room'} />
                  </SelectTrigger>
                  <SelectContent>
                    {roomNames.map((r) => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                onClick={handleStart}
                disabled={!room}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90 golden-glow"
              >
                <Monitor className="h-4 w-4 mr-2" />
                Start Screen Recording
              </Button>

              <div className="text-xs text-muted-foreground space-y-1">
                <p>• Your screen will be captured every second</p>
                <p>• Select "Entire Screen" for full monitoring</p>
                <p>• Keep this tab open during the competition</p>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-success/10 rounded-lg border border-success/20">
                <div className="flex items-center gap-3">
                  <div className="h-3 w-3 bg-success rounded-full animate-pulse" />
                  <span className="font-medium text-success">Recording active</span>
                </div>
                <span className="text-sm text-muted-foreground font-mono">
                  {formatTime(elapsedTime)}
                </span>
              </div>

              <Button
                onClick={() => stopCapture()}
                variant="destructive"
                className="w-full"
              >
                <MonitorOff className="h-4 w-4 mr-2" />
                Stop Recording
              </Button>

              <p className="text-xs text-muted-foreground text-center">
                Do not close this window during the competition
              </p>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 p-3 bg-destructive/10 rounded-lg border border-destructive/20">
              <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
              <span className="text-sm text-destructive">{error}</span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="glass-panel">
        <CardHeader>
          <CardTitle className="text-sm text-foreground flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-success" />
            How it works
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
            <li>Select your room and click "Start Screen Recording"</li>
            <li>Choose "Entire Screen" in the browser dialog</li>
            <li>Keep this tab open throughout the competition</li>
            <li>Competition officials can monitor all participants in real-time and review after the competition</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
};
