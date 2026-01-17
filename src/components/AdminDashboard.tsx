import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatusBadge } from './StatusBadge';
import { Users, Monitor, AlertTriangle, Eye, DoorOpen, RefreshCw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { Database } from '@/integrations/supabase/types';

type Competitor = Database['public']['Tables']['competitors']['Row'];

interface CompetitorWithScreenshot extends Competitor {
  latestScreenshot?: string | null;
}

const ROOMS = ['Rum 41', 'Rum 43'] as const;

export const AdminDashboard = () => {
  const [competitors, setCompetitors] = useState<CompetitorWithScreenshot[]>([]);
  const [selectedCompetitor, setSelectedCompetitor] = useState<CompetitorWithScreenshot | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  // Fetch competitors
  const fetchCompetitors = useCallback(async () => {
    const { data } = await supabase
      .from('competitors')
      .select('*')
      .order('last_seen', { ascending: false });

    if (data) {
      // Fetch latest screenshot for each competitor
      const competitorsWithScreenshots = await Promise.all(
        data.map(async (competitor) => {
          const { data: screenshots } = await supabase
            .from('screenshots')
            .select('storage_path')
            .eq('competitor_id', competitor.id)
            .order('captured_at', { ascending: false })
            .limit(1);

          let latestScreenshot = null;
          if (screenshots && screenshots.length > 0) {
            const { data: urlData } = await supabase.storage
              .from('screenshots')
              .createSignedUrl(screenshots[0].storage_path, 60);
            latestScreenshot = urlData?.signedUrl || null;
          }

          return { ...competitor, latestScreenshot };
        })
      );

      setCompetitors(competitorsWithScreenshots);
      setLastUpdate(new Date());
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCompetitors();

    // Subscribe to realtime updates
    const channel = supabase
      .channel('competitors-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'competitors' },
        (payload) => {
          console.log('Competitor change:', payload);
          fetchCompetitors();
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'screenshots' },
        (payload) => {
          console.log('New screenshot:', payload);
          fetchCompetitors();
        }
      )
      .subscribe((status) => {
        console.log('Realtime subscription status:', status);
      });

    // Refresh every 3 seconds for live updates
    const interval = setInterval(fetchCompetitors, 3000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [fetchCompetitors]);

  // Check for offline competitors (no update in 10 seconds)
  useEffect(() => {
    const checkOffline = async () => {
      const tenSecondsAgo = new Date(Date.now() - 10000).toISOString();
      
      await supabase
        .from('competitors')
        .update({ status: 'offline' })
        .eq('status', 'online')
        .lt('last_seen', tenSecondsAgo);
    };

    const interval = setInterval(checkOffline, 5000);
    return () => clearInterval(interval);
  }, []);

  // Filter competitors by room
  const filteredCompetitors = selectedRoom === 'all' 
    ? competitors 
    : competitors.filter(c => c.room === selectedRoom);

  const onlineCount = filteredCompetitors.filter((c) => c.status === 'online').length;
  const offlineCount = filteredCompetitors.filter((c) => c.status === 'offline').length;

  // Get counts per room
  const roomCounts = ROOMS.reduce((acc, room) => {
    const roomCompetitors = competitors.filter(c => c.room === room);
    acc[room] = {
      total: roomCompetitors.length,
      online: roomCompetitors.filter(c => c.status === 'online').length,
      offline: roomCompetitors.filter(c => c.status === 'offline').length,
    };
    return acc;
  }, {} as Record<string, { total: number; online: number; offline: number }>);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Room Tabs */}
      <Tabs value={selectedRoom} onValueChange={setSelectedRoom}>
        <div className="flex items-center justify-between">
          <TabsList className="bg-secondary">
            <TabsTrigger value="all" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Users className="h-4 w-4 mr-2" />
              All Rooms ({competitors.length})
            </TabsTrigger>
            {ROOMS.map((room) => (
              <TabsTrigger 
                key={room} 
                value={room}
                className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                <DoorOpen className="h-4 w-4 mr-2" />
                {room}
                <span className="ml-2 text-xs">
                  <span className="text-success">{roomCounts[room]?.online || 0}</span>
                  {roomCounts[room]?.offline > 0 && (
                    <span className="text-destructive ml-1">/ {roomCounts[room].offline}</span>
                  )}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <RefreshCw className="h-3 w-3 animate-spin" />
            Updated {formatDistanceToNow(lastUpdate, { addSuffix: true })}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          <Card className="glass-panel">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <Users className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{filteredCompetitors.length}</p>
                <p className="text-sm text-muted-foreground">
                  {selectedRoom === 'all' ? 'Total Competitors' : `In ${selectedRoom}`}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-panel">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-success/10 flex items-center justify-center">
                <Monitor className="h-6 w-6 text-success" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{onlineCount}</p>
                <p className="text-sm text-muted-foreground">Online Now</p>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-panel">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="h-6 w-6 text-destructive" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{offlineCount}</p>
                <p className="text-sm text-muted-foreground">Offline / Alert</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Content for each tab */}
        <TabsContent value={selectedRoom} className="mt-4">
          <Card className="glass-panel">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                <Eye className="h-5 w-5 text-primary" />
                Live Monitoring
                {selectedRoom !== 'all' && (
                  <span className="text-sm font-normal text-muted-foreground">— {selectedRoom}</span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {filteredCompetitors.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Monitor className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No competitors in {selectedRoom === 'all' ? 'any room' : selectedRoom}</p>
                  <p className="text-sm">Competitors will appear here when they start screen capture</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {filteredCompetitors.map((competitor) => (
                    <div
                      key={competitor.id}
                      className={`group relative rounded-lg overflow-hidden border cursor-pointer transition-all duration-200 hover:ring-2 hover:ring-primary ${
                        competitor.status === 'offline'
                          ? 'border-destructive/50 bg-destructive/5 animate-pulse'
                          : 'border-border bg-card'
                      }`}
                      onClick={() => setSelectedCompetitor(competitor)}
                    >
                      {/* Screenshot Preview */}
                      <div className="aspect-video bg-muted relative">
                        {competitor.latestScreenshot ? (
                          <img
                            src={competitor.latestScreenshot}
                            alt={`${competitor.name}'s screen`}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <Monitor className="h-8 w-8 text-muted-foreground/50" />
                          </div>
                        )}
                        
                        {/* Status indicator overlay */}
                        <div className="absolute top-2 right-2">
                          <StatusBadge status={competitor.status as 'online' | 'offline' | 'inactive'} />
                        </div>

                        {/* Room badge */}
                        {selectedRoom === 'all' && competitor.room && (
                          <div className="absolute top-2 left-2 px-2 py-0.5 bg-background/80 backdrop-blur-sm rounded text-xs font-medium text-foreground">
                            {competitor.room}
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="p-3">
                        <h3 className="font-medium text-foreground truncate">{competitor.name}</h3>
                        <p className="text-xs text-muted-foreground">
                          Last seen:{' '}
                          {competitor.last_seen
                            ? formatDistanceToNow(new Date(competitor.last_seen), { addSuffix: true })
                            : 'Never'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Fullscreen Preview Modal */}
      {selectedCompetitor && (
        <div
          className="fixed inset-0 bg-background/95 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedCompetitor(null)}
        >
          <div
            className="max-w-5xl w-full animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold text-foreground">{selectedCompetitor.name}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <StatusBadge
                    status={selectedCompetitor.status as 'online' | 'offline' | 'inactive'}
                  />
                  {selectedCompetitor.room && (
                    <span className="px-2 py-0.5 bg-secondary rounded text-xs font-medium text-foreground">
                      {selectedCompetitor.room}
                    </span>
                  )}
                  <span className="text-sm text-muted-foreground">
                    Last seen:{' '}
                    {selectedCompetitor.last_seen
                      ? formatDistanceToNow(new Date(selectedCompetitor.last_seen), {
                          addSuffix: true,
                        })
                      : 'Never'}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedCompetitor(null)}
                className="text-muted-foreground hover:text-foreground text-2xl"
              >
                ×
              </button>
            </div>

            <div className="rounded-lg overflow-hidden border border-border bg-card">
              {selectedCompetitor.latestScreenshot ? (
                <img
                  src={selectedCompetitor.latestScreenshot}
                  alt={`${selectedCompetitor.name}'s screen`}
                  className="w-full h-auto"
                />
              ) : (
                <div className="aspect-video flex items-center justify-center bg-muted">
                  <div className="text-center text-muted-foreground">
                    <Monitor className="h-16 w-16 mx-auto mb-4 opacity-50" />
                    <p>No screenshot available</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};