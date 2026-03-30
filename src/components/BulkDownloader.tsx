import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Download, Search, Loader2, Archive } from 'lucide-react';
import { format } from 'date-fns';
import JSZip from 'jszip';

interface UserEntry {
  user_id: string;
  name: string;
  segmentCount: number;
}

interface BulkDownloaderProps {
  onClose: () => void;
}

export const BulkDownloader = ({ onClose }: BulkDownloaderProps) => {
  const [users, setUsers] = useState<UserEntry[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [startAfter, setStartAfter] = useState('');
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  useEffect(() => {
    const fetchUsers = async () => {
      setLoading(true);
      // Get all competitors
      const { data: competitors } = await supabase
        .from('competitors')
        .select('id, user_id, name');

      if (!competitors?.length) {
        setUsers([]);
        setLoading(false);
        return;
      }

      // Deduplicate by user_id, keep latest name
      const userMap = new Map<string, { name: string; competitorIds: string[] }>();
      competitors.forEach(c => {
        const existing = userMap.get(c.user_id);
        if (existing) {
          existing.competitorIds.push(c.id);
        } else {
          userMap.set(c.user_id, { name: c.name, competitorIds: [c.id] });
        }
      });

      // Get segment counts per user (with optional timestamp filter)
      const isoFilter = startAfter ? new Date(startAfter).toISOString() : null;
      const entries: UserEntry[] = [];
      for (const [user_id, { name, competitorIds }] of userMap) {
        let query = supabase
          .from('screenshots')
          .select('*', { count: 'exact', head: true })
          .in('competitor_id', competitorIds);

        if (isoFilter) {
          query = query.gte('captured_at', isoFilter);
        }

        const { count } = await query;
        entries.push({ user_id, name, segmentCount: count || 0 });
      }

      entries.sort((a, b) => a.name.localeCompare(b.name));
      setUsers(entries);
      setLoading(false);
    };

    fetchUsers();
  }, [startAfter]);

  const filteredUsers = users.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase())
  );

  const allFilteredSelected = filteredUsers.length > 0 && filteredUsers.every(u => selected.has(u.user_id));

  const toggleUser = (userId: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const toggleAll = () => {
    if (allFilteredSelected) {
      setSelected(prev => {
        const next = new Set(prev);
        filteredUsers.forEach(u => next.delete(u.user_id));
        return next;
      });
    } else {
      setSelected(prev => {
        const next = new Set(prev);
        filteredUsers.forEach(u => next.add(u.user_id));
        return next;
      });
    }
  };

  const totalSelectedSegments = users
    .filter(u => selected.has(u.user_id))
    .reduce((sum, u) => sum + u.segmentCount, 0);

  const handleDownload = async () => {
    if (selected.size === 0) return;
    setDownloading(true);

    try {
      // Get all competitor IDs for selected users
      const { data: competitors } = await supabase
        .from('competitors')
        .select('id, user_id, name')
        .in('user_id', Array.from(selected));

      if (!competitors?.length) return;

      const competitorIds = competitors.map(c => c.id);
      const competitorMap = new Map(competitors.map(c => [c.id, c]));

      // Fetch all screenshots in batches (respecting 1000 row limit)
      const isoFilter = startAfter ? new Date(startAfter).toISOString() : null;
      let allScreenshots: { id: string; storage_path: string; captured_at: string; competitor_id: string }[] = [];
      for (let i = 0; i < competitorIds.length; i += 50) {
        const batch = competitorIds.slice(i, i + 50);
        let query = supabase
          .from('screenshots')
          .select('id, storage_path, captured_at, competitor_id')
          .in('competitor_id', batch)
          .order('captured_at', { ascending: true })
          .limit(1000);

        if (isoFilter) {
          query = query.gte('captured_at', isoFilter);
        }

        const { data } = await query;
        if (data) allScreenshots = [...allScreenshots, ...data];
      }

      setProgress({ current: 0, total: allScreenshots.length });

      // Download each segment
      for (let i = 0; i < allScreenshots.length; i++) {
        const screenshot = allScreenshots[i];
        const competitor = competitorMap.get(screenshot.competitor_id);
        const name = competitor?.name || 'unknown';
        const dateStr = format(new Date(screenshot.captured_at), 'yyyy-MM-dd-HH-mm');

        try {
          const { data: signedData } = await supabase.storage
            .from('screenshots')
            .createSignedUrl(screenshot.storage_path, 300);

          if (signedData?.signedUrl) {
            const response = await fetch(signedData.signedUrl);
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${name}-${dateStr}-segment-${i + 1}.webm`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 2000);
          }
        } catch (err) {
          console.error(`Failed to download segment ${i + 1}:`, err);
        }

        setProgress({ current: i + 1, total: allScreenshots.length });

        // Stagger downloads
        if (i < allScreenshots.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Dialog open onOpenChange={() => !downloading && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Bulk Download Recordings</DialogTitle>
          <DialogDescription>
            Select users to download all their recording segments.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search users..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-foreground">
            Competition start (only segments after this time)
          </label>
          <div className="flex gap-2">
            <Input
              type="datetime-local"
              value={startAfter}
              onChange={e => setStartAfter(e.target.value)}
              className="flex-1"
            />
            {startAfter && (
              <Button variant="ghost" size="sm" onClick={() => setStartAfter('')}>
                Clear
              </Button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 py-1 border-b border-border">
              <Checkbox
                checked={allFilteredSelected}
                onCheckedChange={toggleAll}
                id="select-all"
              />
              <label htmlFor="select-all" className="text-sm font-medium text-foreground cursor-pointer">
                Select all ({filteredUsers.length})
              </label>
            </div>

            <ScrollArea className="h-64">
              <div className="space-y-1">
                {filteredUsers.map(user => (
                  <label
                    key={user.user_id}
                    className="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-accent cursor-pointer"
                  >
                    <Checkbox
                      checked={selected.has(user.user_id)}
                      onCheckedChange={() => toggleUser(user.user_id)}
                    />
                    <span className="flex-1 text-sm text-foreground truncate">{user.name}</span>
                    <span className="text-xs text-muted-foreground">{user.segmentCount} segments</span>
                  </label>
                ))}
                {filteredUsers.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">No users found</p>
                )}
              </div>
            </ScrollArea>
          </>
        )}

        {downloading && (
          <div className="space-y-2">
            <Progress value={(progress.current / progress.total) * 100} />
            <p className="text-xs text-muted-foreground text-center">
              Downloading {progress.current} of {progress.total} segments...
            </p>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={downloading}>
            Cancel
          </Button>
          <Button
            onClick={handleDownload}
            disabled={selected.size === 0 || downloading}
            className="gap-2"
          >
            {downloading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Download {totalSelectedSegments > 0 ? `(${totalSelectedSegments} segments)` : ''}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
