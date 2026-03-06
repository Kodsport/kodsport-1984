import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { StatusBadge } from './StatusBadge';
import { RecordingsViewer } from './RecordingsViewer';
import { useAdminNotifications } from '@/hooks/useAdminNotifications';
import { Users, Monitor, AlertTriangle, Eye, DoorOpen, RefreshCw, Video, Bell, BellOff, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { sv } from 'date-fns/locale';
import type { Database } from '@/integrations/supabase/types';

type Competitor = Database['public']['Tables']['competitors']['Row'];

interface CompetitorWithScreenshot extends Competitor {
  latestScreenshot?: string | null;
  isLive?: boolean;
}

const ROOMS = ['Kammaren'] as const;

export const AdminDashboard = () => {
  const [competitors, setCompetitors] = useState<CompetitorWithScreenshot[]>([]);
  const [liveScreenshots, setLiveScreenshots] = useState<Map<string, string>>(new Map());
  const [selectedCompetitor, setSelectedCompetitor] = useState<CompetitorWithScreenshot | null>(null);
  const [viewingRecordings, setViewingRecordings] = useState<CompetitorWithScreenshot | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const fetchingRef = useRef(false);
  const channelsRef = useRef<ReturnType<typeof supabase.channel>[]>([]);
  
  const { notificationPermission, requestPermission } = useAdminNotifications();

  // Hämta deltagare
  const fetchCompetitors = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    try {
      const oneDayAgo = new Date(Date.now() - 86400000).toISOString();
      
      const { data } = await supabase
        .from('competitors')
        .select('*')
        .gte('last_seen', oneDayAgo)
        .order('started_at', { ascending: false });

      if (data) {
        // Filtrera bort gamla sessioner - visa endast senaste per användare
        const latestByUser = new Map<string, typeof data[0]>();
        data.forEach(competitor => {
          const existing = latestByUser.get(competitor.user_id);
          if (!existing) {
            latestByUser.set(competitor.user_id, competitor);
          } else {
            if (competitor.status === 'online' && existing.status !== 'online') {
              latestByUser.set(competitor.user_id, competitor);
            }
          }
        });
        
        const filteredData = Array.from(latestByUser.values());
        
        // Sortera: offline först, sedan alfabetiskt efter namn för determinism
        filteredData.sort((a, b) => {
          // Offline first
          if (a.status === 'offline' && b.status !== 'offline') return -1;
          if (a.status !== 'offline' && b.status === 'offline') return 1;
          // Then by name alphabetically for stable ordering
          return a.name.localeCompare(b.name, 'sv');
        });

        // Merge med live screenshots
        const competitorsWithScreenshots = filteredData.map(competitor => ({
          ...competitor,
          latestScreenshot: liveScreenshots.get(competitor.id) || null,
          isLive: liveScreenshots.has(competitor.id) && competitor.status === 'online',
        }));

        setCompetitors(competitorsWithScreenshots);
        setLastUpdate(new Date());
      }
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [liveScreenshots]);

  // Prenumerera på live-sändningar för varje rum
  useEffect(() => {
    // Rensa gamla kanaler
    channelsRef.current.forEach(channel => {
      supabase.removeChannel(channel);
    });
    channelsRef.current = [];

    // Skapa kanaler för varje rum
    ROOMS.forEach(room => {
      const channel = supabase.channel(`live-screenshots-${room}`, {
        config: {
          broadcast: { self: false },
        },
      });

      channel.on('broadcast', { event: 'screenshot' }, (payload) => {
        const { competitorId, imageData } = payload.payload as {
          competitorId: string;
          userId: string;
          imageData: string;
          timestamp: number;
        };

        setLiveScreenshots(prev => {
          const newMap = new Map(prev);
          newMap.set(competitorId, imageData);
          return newMap;
        });

        // Uppdatera kompetitors skärmbild direkt
        setCompetitors(prev => 
          prev.map(c => 
            c.id === competitorId 
              ? { ...c, latestScreenshot: imageData, isLive: true }
              : c
          )
        );

        // Uppdatera även vald deltagare om den matchar
        setSelectedCompetitor(prev => 
          prev?.id === competitorId 
            ? { ...prev, latestScreenshot: imageData, isLive: true }
            : prev
        );
      });

      channel.subscribe();
      channelsRef.current.push(channel);
    });

    return () => {
      channelsRef.current.forEach(channel => {
        supabase.removeChannel(channel);
      });
    };
  }, []);

  useEffect(() => {
    fetchCompetitors();

    // Prenumerera på realtidsuppdateringar för competitors-tabellen
    const channel = supabase
      .channel('competitors-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'competitors' },
        () => fetchCompetitors()
      )
      .subscribe();

    // Uppdatera var 5:e sekund
    const interval = setInterval(fetchCompetitors, 5000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [fetchCompetitors]);

  // Check for stale competitors via backend (handles Discord notifications)
  useEffect(() => {
    const checkStaleCompetitors = async () => {
      try {
        await supabase.functions.invoke('check-competitors');
      } catch (err) {
        console.error('Failed to check stale competitors:', err);
      }
    };

    // Run immediately and then every 5 seconds
    checkStaleCompetitors();
    const interval = setInterval(checkStaleCompetitors, 5000);
    return () => clearInterval(interval);
  }, []);

  // Filtrera deltagare efter rum
  const filteredCompetitors = selectedRoom === 'all' 
    ? competitors 
    : competitors.filter(c => c.room === selectedRoom);

  const onlineCount = filteredCompetitors.filter((c) => c.status === 'online').length;
  const offlineCount = filteredCompetitors.filter((c) => c.status === 'offline').length;

  // Hämta antal per rum
  const roomCounts = ROOMS.reduce((acc, room) => {
    const roomCompetitors = competitors.filter(c => c.room === room);
    acc[room] = {
      total: roomCompetitors.length,
      online: roomCompetitors.filter(c => c.status === 'online').length,
      offline: roomCompetitors.filter(c => c.status === 'offline').length,
    };
    return acc;
  }, {} as Record<string, { total: number; online: number; offline: number }>);

  // Hantera klick på deltagare
  const handleCompetitorClick = (competitor: CompetitorWithScreenshot) => {
    setSelectedCompetitor(competitor);
  };

  // Get current index and navigation functions
  const currentIndex = selectedCompetitor 
    ? filteredCompetitors.findIndex(c => c.id === selectedCompetitor.id)
    : -1;

  const navigateToPrevious = useCallback(() => {
    if (currentIndex > 0) {
      setSelectedCompetitor(filteredCompetitors[currentIndex - 1]);
    }
  }, [currentIndex, filteredCompetitors]);

  const navigateToNext = useCallback(() => {
    if (currentIndex < filteredCompetitors.length - 1) {
      setSelectedCompetitor(filteredCompetitors[currentIndex + 1]);
    }
  }, [currentIndex, filteredCompetitors]);

  // Keyboard navigation
  useEffect(() => {
    if (!selectedCompetitor) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        navigateToPrevious();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        navigateToNext();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setSelectedCompetitor(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedCompetitor, navigateToPrevious, navigateToNext]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Rumflikar */}
      <Tabs value={selectedRoom} onValueChange={setSelectedRoom}>
        <div className="flex items-center justify-between">
          <TabsList className="bg-secondary">
            <TabsTrigger value="all" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Users className="h-4 w-4 mr-2" />
              Alla rum ({competitors.length})
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

          <div className="flex items-center gap-3">
            {/* Notification toggle button */}
            <Button
              variant={notificationPermission === 'granted' ? 'default' : 'outline'}
              size="sm"
              onClick={requestPermission}
              className="gap-2"
            >
              {notificationPermission === 'granted' ? (
                <>
                  <Bell className="h-4 w-4" />
                  Notiser på
                </>
              ) : (
                <>
                  <BellOff className="h-4 w-4" />
                  Aktivera notiser
                </>
              )}
            </Button>
            
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <RefreshCw className="h-3 w-3 animate-spin" />
              Uppdaterad {formatDistanceToNow(lastUpdate, { addSuffix: true, locale: sv })}
            </div>
          </div>
        </div>

        {/* Statistik */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          <Card className="glass-panel">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <Users className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{filteredCompetitors.length}</p>
                <p className="text-sm text-muted-foreground">
                  {selectedRoom === 'all' ? 'Totalt antal deltagare' : `I ${selectedRoom}`}
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
                <p className="text-sm text-muted-foreground">Online nu</p>
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
                <p className="text-sm text-muted-foreground">Offline / Varning</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Innehåll för varje flik */}
        <TabsContent value={selectedRoom} className="mt-4">
          <Card className="glass-panel">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                <Eye className="h-5 w-5 text-primary" />
                Live-övervakning
                {selectedRoom !== 'all' && (
                  <span className="text-sm font-normal text-muted-foreground">— {selectedRoom}</span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {filteredCompetitors.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Monitor className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Inga deltagare i {selectedRoom === 'all' ? 'något rum' : selectedRoom}</p>
                  <p className="text-sm">Deltagare visas här när de startar skärminspelning</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {filteredCompetitors.map((competitor) => (
                    <div
                      key={competitor.id}
                      className={`group relative rounded-lg overflow-hidden border cursor-pointer transition-all duration-200 hover:ring-2 hover:ring-primary ${
                        competitor.status === 'offline'
                          ? 'border-destructive/50 bg-destructive/5'
                          : 'border-border bg-card'
                      }`}
                      onClick={() => handleCompetitorClick(competitor)}
                    >
                      {/* Skärmbildsförhandsvisning */}
                      <div className="aspect-video bg-muted relative">
                        {competitor.latestScreenshot ? (
                          <img
                            src={competitor.latestScreenshot}
                            alt={`${competitor.name}s skärm`}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <Monitor className="h-8 w-8 text-muted-foreground/50" />
                          </div>
                        )}
                        
                        {/* Live-indikator */}
                        {competitor.isLive && (
                          <div className="absolute bottom-2 left-2 flex items-center gap-1 px-2 py-0.5 bg-destructive text-destructive-foreground rounded text-xs font-medium">
                            <span className="h-2 w-2 bg-white rounded-full animate-pulse" />
                            LIVE
                          </div>
                        )}

                        {/* Statusindikator */}
                        <div className="absolute top-2 right-2">
                          <StatusBadge status={competitor.status as 'online' | 'offline' | 'inactive'} />
                        </div>

                        {/* Rummärke */}
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
                          Senast sedd:{' '}
                          {competitor.last_seen
                            ? formatDistanceToNow(new Date(competitor.last_seen), { addSuffix: true, locale: sv })
                            : 'Aldrig'}
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

      {/* Fullskärmsförhandsvisning */}
      {selectedCompetitor && (
        <div
          className="fixed inset-0 bg-background/95 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedCompetitor(null)}
        >
          {/* Left navigation arrow */}
          <Button
            variant="ghost"
            size="icon"
            className="absolute left-4 top-1/2 -translate-y-1/2 h-12 w-12 rounded-full bg-background/80 hover:bg-background disabled:opacity-30"
            onClick={(e) => {
              e.stopPropagation();
              navigateToPrevious();
            }}
            disabled={currentIndex <= 0}
          >
            <ChevronLeft className="h-8 w-8" />
          </Button>

          {/* Right navigation arrow */}
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-4 top-1/2 -translate-y-1/2 h-12 w-12 rounded-full bg-background/80 hover:bg-background disabled:opacity-30"
            onClick={(e) => {
              e.stopPropagation();
              navigateToNext();
            }}
            disabled={currentIndex >= filteredCompetitors.length - 1}
          >
            <ChevronRight className="h-8 w-8" />
          </Button>

          <div
            className="max-w-5xl w-full animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                  {selectedCompetitor.name}
                  {selectedCompetitor.isLive && (
                    <span className="flex items-center gap-1 px-2 py-0.5 bg-destructive text-destructive-foreground rounded text-xs font-medium">
                      <span className="h-2 w-2 bg-white rounded-full animate-pulse" />
                      LIVE
                    </span>
                  )}
                  <span className="text-sm font-normal text-muted-foreground ml-2">
                    ({currentIndex + 1} / {filteredCompetitors.length})
                  </span>
                </h2>
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
                    Senast sedd:{' '}
                    {selectedCompetitor.last_seen
                      ? formatDistanceToNow(new Date(selectedCompetitor.last_seen), {
                          addSuffix: true,
                          locale: sv,
                        })
                      : 'Aldrig'}
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
                  alt={`${selectedCompetitor.name}s skärm`}
                  className="w-full h-auto"
                />
              ) : (
                <div className="aspect-video flex items-center justify-center bg-muted">
                  <div className="text-center text-muted-foreground">
                    <Monitor className="h-16 w-16 mx-auto mb-4 opacity-50" />
                    <p>Ingen skärmbild tillgänglig</p>
                    <p className="text-sm mt-2">Väntar på live-sändning...</p>
                  </div>
                </div>
              )}
            </div>

            {/* Video recordings button */}
            <div className="mt-4 flex items-center gap-4">
              <Button
                variant="outline"
                onClick={() => {
                  setViewingRecordings(selectedCompetitor);
                  setSelectedCompetitor(null);
                }}
                className="flex-1"
              >
                <Video className="h-4 w-4 mr-2" />
                Visa inspelningar
              </Button>
            </div>

            <p className="mt-3 text-xs text-muted-foreground text-center">
              Använd ← → piltangenter för att navigera • ESC för att stänga
            </p>
          </div>
        </div>
      )}

      {/* Recordings Viewer Modal */}
      {viewingRecordings && (
        <RecordingsViewer
          competitorId={viewingRecordings.id}
          competitorName={viewingRecordings.name}
          onClose={() => setViewingRecordings(null)}
        />
      )}
    </div>
  );
};
