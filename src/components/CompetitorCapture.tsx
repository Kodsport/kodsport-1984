import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useScreenCapture } from '@/hooks/useScreenCapture';
import { useAuth } from '@/hooks/useAuth';
import { useDevToolsDetection } from '@/hooks/useDevToolsDetection';
import { supabase } from '@/integrations/supabase/client';
import { Monitor, MonitorOff, AlertCircle, CheckCircle, Camera, DoorOpen, User, ShieldAlert } from 'lucide-react';

const ROOM = 'Kammaren';

export const CompetitorCapture = () => {
  const [room] = useState(ROOM);
  const [elapsedTime, setElapsedTime] = useState(0);
  const { isCapturing, error, startTime, competitorId, startCapture, stopCapture } = useScreenCapture();
  const { user } = useAuth();

  const userName = user?.user_metadata?.name || user?.email?.split('@')[0] || 'Deltagare';

  // Broadcast devtools detection to admins
  const handleDevToolsDetected = useCallback(async () => {
    if (!room || !competitorId) return;

    // Send Discord notification via edge function
    try {
      await supabase.functions.invoke('discord-alert', {
        body: {
          type: 'devtools',
          competitorName: userName,
          room,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err) {
      console.error('Failed to send Discord alert:', err);
    }

    // Also send realtime alert for in-app notifications
    const channel = supabase.channel('admin-alerts');
    await channel.subscribe();
    
    channel.send({
      type: 'broadcast',
      event: 'alert',
      payload: {
        type: 'devtools',
        competitorId,
        competitorName: userName,
        room,
        timestamp: Date.now(),
        message: `${userName} öppnade utvecklarverktyg (Inspect Element)`,
      },
    });

    // Unsubscribe after sending
    setTimeout(() => supabase.removeChannel(channel), 1000);
  }, [room, competitorId, userName]);

  const { hasBeenOpened } = useDevToolsDetection({
    onDetected: handleDevToolsDetected,
  });

  // Timer effect
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
      {/* DevTools Warning Alert */}
      {hasBeenOpened && (
        <Alert variant="destructive" className="border-destructive bg-destructive/10">
          <ShieldAlert className="h-5 w-5" />
          <AlertTitle className="font-bold">Varning: Utvecklarverktyg upptäckta!</AlertTitle>
          <AlertDescription className="mt-2">
            <p>Användning av utvecklarverktyg (Inspect Element) är inte tillåtet under tävlingen.</p>
            <p className="mt-1 font-medium">Denna händelse har loggats och kommer att granskas av tävlingsfunktionärer.</p>
          </AlertDescription>
        </Alert>
      )}

      <Card className="glass-panel card-elevated">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <Camera className="h-5 w-5 text-primary" />
            Skärmövervakning
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Starta skärminspelning för att övervaka din session under tävlingen
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isCapturing ? (
            <>
              {/* Visa användarnamn */}
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
                <Label htmlFor="room" className="text-foreground flex items-center gap-2">
                  <DoorOpen className="h-4 w-4" />
                  Rum
                </Label>
                <Select value={room} onValueChange={(value) => setRoom(value as Room)}>
                  <SelectTrigger className="bg-secondary border-border">
                    <SelectValue placeholder="Välj ditt rum" />
                  </SelectTrigger>
                  <SelectContent>
                    {ROOMS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
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
                Starta skärminspelning
              </Button>

              <div className="text-xs text-muted-foreground space-y-1">
                <p>• Din skärm kommer att fångas varje sekund</p>
                <p>• Välj "Hela skärmen" för fullständig övervakning</p>
                <p>• Håll denna flik öppen under tävlingen</p>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-success/10 rounded-lg border border-success/20">
                <div className="flex items-center gap-3">
                  <div className="h-3 w-3 bg-success rounded-full animate-pulse" />
                  <span className="font-medium text-success">Inspelning aktiv</span>
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
                Stoppa inspelning
              </Button>

              <p className="text-xs text-muted-foreground text-center">
                Stäng inte detta fönster under tävlingen
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
            Så här fungerar det
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
            <li>Välj ditt rum och klicka på "Starta skärminspelning"</li>
            <li>Välj "Hela skärmen" i webbläsarens dialog</li>
            <li>Håll denna flik öppen under hela tävlingen</li>
            <li>Tävlingsfunktionärer kan övervaka alla deltagare i realtid samt granska efter tävling</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
};
