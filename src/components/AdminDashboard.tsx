import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from './StatusBadge';
import { Users, Monitor, AlertTriangle, Eye } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { Database } from '@/integrations/supabase/types';

type Competitor = Database['public']['Tables']['competitors']['Row'];

interface CompetitorWithScreenshot extends Competitor {
  latestScreenshot?: string | null;
}

export const AdminDashboard = () => {
  const [competitors, setCompetitors] = useState<CompetitorWithScreenshot[]>([]);
  const [selectedCompetitor, setSelectedCompetitor] = useState<CompetitorWithScreenshot | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch competitors
  useEffect(() => {
    const fetchCompetitors = async () => {
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
      }
      setLoading(false);
    };

    fetchCompetitors();

    // Subscribe to realtime updates
    const channel = supabase
      .channel('competitors-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'competitors' },
        () => {
          fetchCompetitors();
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'screenshots' },
        () => {
          fetchCompetitors();
        }
      )
      .subscribe();

    // Refresh every 5 seconds for screenshot updates
    const interval = setInterval(fetchCompetitors, 5000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, []);

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

  const onlineCount = competitors.filter((c) => c.status === 'online').length;
  const offlineCount = competitors.filter((c) => c.status === 'offline').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="glass-panel">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
              <Users className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{competitors.length}</p>
              <p className="text-sm text-muted-foreground">Total Competitors</p>
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

      {/* Competitor Grid */}
      <Card className="glass-panel">
        <CardHeader>
          <CardTitle className="text-foreground flex items-center gap-2">
            <Eye className="h-5 w-5 text-primary" />
            Live Monitoring
          </CardTitle>
        </CardHeader>
        <CardContent>
          {competitors.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Monitor className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No competitors are being monitored yet</p>
              <p className="text-sm">Competitors will appear here when they start screen capture</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {competitors.map((competitor) => (
                <div
                  key={competitor.id}
                  className={`group relative rounded-lg overflow-hidden border cursor-pointer transition-all duration-200 hover:ring-2 hover:ring-primary ${
                    competitor.status === 'offline'
                      ? 'border-destructive/50 bg-destructive/5'
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
