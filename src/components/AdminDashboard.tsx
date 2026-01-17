import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatusBadge } from './StatusBadge';
import { Users, Monitor, AlertTriangle, Eye, DoorOpen, RefreshCw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { sv } from 'date-fns/locale';
import type { Database } from '@/integrations/supabase/types';

type Competitor = Database['public']['Tables']['competitors']['Row'];

interface CompetitorWithScreenshot extends Competitor {
  latestScreenshot?: string | null;
}

const ROOMS = ['Rum 41', 'Rum 43'] as const;

// Cache för signerade URLs (5 min)
const urlCache = new Map<string, { url: string; expires: number }>();

export const AdminDashboard = () => {
  const [competitors, setCompetitors] = useState<CompetitorWithScreenshot[]>([]);
  const [selectedCompetitor, setSelectedCompetitor] = useState<CompetitorWithScreenshot | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const fetchingRef = useRef(false);

  // Hämta signerad URL med cache
  const getSignedUrl = useCallback(async (storagePath: string): Promise<string | null> => {
    const now = Date.now();
    const cached = urlCache.get(storagePath);
    
    if (cached && cached.expires > now) {
      return cached.url;
    }

    const { data } = await supabase.storage
      .from('screenshots')
      .createSignedUrl(storagePath, 300); // 5 min

    if (data?.signedUrl) {
      urlCache.set(storagePath, { 
        url: data.signedUrl, 
        expires: now + 240000 // Cache 4 min
      });
      return data.signedUrl;
    }
    return null;
  }, []);

  // Hämta deltagare - optimerad
  const fetchCompetitors = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    try {
      // Hämta endast aktiva deltagare (senaste 24 timmarna)
      const oneDayAgo = new Date(Date.now() - 86400000).toISOString();
      
      const { data } = await supabase
        .from('competitors')
        .select('*')
        .gte('last_seen', oneDayAgo)
        .order('status', { ascending: true }) // Online först
        .order('last_seen', { ascending: false });

      if (data) {
        // Hämta senaste skärmbild för varje deltagare (batch query)
        const competitorIds = data.map(c => c.id);
        
        // En enda query för alla screenshots
        const { data: allScreenshots } = await supabase
          .from('screenshots')
          .select('competitor_id, storage_path')
          .in('competitor_id', competitorIds)
          .order('captured_at', { ascending: false });

        // Gruppera screenshots per deltagare
        const screenshotMap = new Map<string, string>();
        allScreenshots?.forEach(s => {
          if (!screenshotMap.has(s.competitor_id)) {
            screenshotMap.set(s.competitor_id, s.storage_path);
          }
        });

        // Hämta signerade URLs endast för online deltagare
        const competitorsWithScreenshots = await Promise.all(
          data.map(async (competitor) => {
            const storagePath = screenshotMap.get(competitor.id);
            let latestScreenshot = null;

            // Prioritera online deltagare för skärmbilder
            if (storagePath && competitor.status === 'online') {
              latestScreenshot = await getSignedUrl(storagePath);
            }

            return { ...competitor, latestScreenshot };
          })
        );

        setCompetitors(competitorsWithScreenshots);
        setLastUpdate(new Date());
      }
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [getSignedUrl]);

  // Ladda skärmbilder för offline-deltagare on-demand
  const loadScreenshotForCompetitor = useCallback(async (competitor: CompetitorWithScreenshot) => {
    if (competitor.latestScreenshot) return competitor;

    const { data: screenshots } = await supabase
      .from('screenshots')
      .select('storage_path')
      .eq('competitor_id', competitor.id)
      .order('captured_at', { ascending: false })
      .limit(1);

    if (screenshots?.[0]) {
      const url = await getSignedUrl(screenshots[0].storage_path);
      return { ...competitor, latestScreenshot: url };
    }
    return competitor;
  }, [getSignedUrl]);

  useEffect(() => {
    fetchCompetitors();

    // Prenumerera på realtidsuppdateringar
    const channel = supabase
      .channel('competitors-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'competitors' },
        () => fetchCompetitors()
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'screenshots' },
        () => fetchCompetitors()
      )
      .subscribe();

    // Uppdatera var 5:e sekund (minskad från 3s)
    const interval = setInterval(fetchCompetitors, 5000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [fetchCompetitors]);

  // Kontrollera offline-deltagare (ingen uppdatering på 10 sekunder)
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

  // Hantera klick på deltagare - ladda skärmbild om det saknas
  const handleCompetitorClick = async (competitor: CompetitorWithScreenshot) => {
    if (!competitor.latestScreenshot) {
      const updated = await loadScreenshotForCompetitor(competitor);
      setSelectedCompetitor(updated);
    } else {
      setSelectedCompetitor(competitor);
    }
  };

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

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <RefreshCw className="h-3 w-3 animate-spin" />
            Uppdaterad {formatDistanceToNow(lastUpdate, { addSuffix: true, locale: sv })}
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
                            loading="lazy"
                          />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <Monitor className="h-8 w-8 text-muted-foreground/50" />
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