import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useScreenCapture } from '@/hooks/useScreenCapture';
import { Monitor, MonitorOff, AlertCircle, CheckCircle, Camera, DoorOpen } from 'lucide-react';

const ROOMS = ['Rum 41', 'Rum 43'] as const;
type Room = typeof ROOMS[number];

export const CompetitorCapture = () => {
  const [name, setName] = useState('');
  const [room, setRoom] = useState<Room>('Rum 41');
  const { isCapturing, error, captureCount, startCapture, stopCapture } = useScreenCapture();

  const handleStart = () => {
    if (name.trim() && room) {
      startCapture(name.trim(), room);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="glass-panel card-elevated">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <Camera className="h-5 w-5 text-primary" />
            Screen Monitoring
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Start screen capture to monitor your session during the competition
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isCapturing ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="competitor-name" className="text-foreground">
                  Your Name
                </Label>
                <Input
                  id="competitor-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your full name"
                  className="bg-secondary border-border"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="room" className="text-foreground flex items-center gap-2">
                  <DoorOpen className="h-4 w-4" />
                  Room
                </Label>
                <Select value={room} onValueChange={(value) => setRoom(value as Room)}>
                  <SelectTrigger className="bg-secondary border-border">
                    <SelectValue placeholder="Select your room" />
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
                disabled={!name.trim() || !room}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90 golden-glow"
              >
                <Monitor className="h-4 w-4 mr-2" />
                Start Screen Capture
              </Button>

              <div className="text-xs text-muted-foreground space-y-1">
                <p>• Your screen will be captured every second</p>
                <p>• Select "Entire screen" for full monitoring</p>
                <p>• Keep this tab open during the competition</p>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-success/10 rounded-lg border border-success/20">
                <div className="flex items-center gap-3">
                  <div className="h-3 w-3 bg-success rounded-full animate-pulse" />
                  <span className="font-medium text-success">Capturing Active</span>
                </div>
                <span className="text-sm text-muted-foreground font-mono">
                  {captureCount} captures
                </span>
              </div>

              <Button
                onClick={stopCapture}
                variant="destructive"
                className="w-full"
              >
                <MonitorOff className="h-4 w-4 mr-2" />
                Stop Capture
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
            <li>Enter your name and click "Start Screen Capture"</li>
            <li>Select "Entire screen" in the browser dialog</li>
            <li>Keep this tab open during the entire competition</li>
            <li>Competition admins can monitor all participants in real-time</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
};
