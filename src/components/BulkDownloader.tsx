import { useState, useEffect, useRef } from 'react';
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

const CONCURRENCY = 6;

async function pooledMap<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency: number,
  onDone?: () => void,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
      onDone?.();
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

export const BulkDownloader = ({ onClose }: BulkDownloaderProps) => {
  const [users, setUsers] = useState<UserEntry[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [startAfter, setStartAfter] = useState('');
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [downloadMode, setDownloadMode] = useState<'files' | 'zip' | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const progressRef = useRef(0);

  useEffect(() => {
    const fetchUsers = async () => {
      setLoading(true);
      const { data: competitors } = await supabase
        .from('competitors')
        .select('id, user_id, name');

      if (!competitors?.length) {
        setUsers([]);
        setLoading(false);
        return;
      }

      const userMap = new Map<string, { name: string; competitorIds: string[] }>();
      competitors.forEach(c => {
        const existing = userMap.get(c.user_id);
        if (existing) {
          existing.competitorIds.push(c.id);
        } else {
          userMap.set(c.user_id, { name: c.name, competitorIds: [c.id] });
        }
      });

      const isoFilter = startAfter ? new Date(startAfter).toISOString() : null;

      // Parallel count fetching
      const userEntries = Array.from(userMap.entries());
      const counts = await Promise.all(
        userEntries.map(async ([, { competitorIds }]) => {
          let query = supabase
            .from('screenshots')
            .select('*', { count: 'exact', head: true })
            .in('competitor_id', competitorIds);
          if (isoFilter) query = query.gte('captured_at', isoFilter);
          const { count } = await query;
          return count || 0;
        })
      );

      const entries: UserEntry[] = userEntries.map(([user_id, { name }], i) => ({
        user_id,
        name,
        segmentCount: counts[i],
      }));

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

  const fetchSegmentsWithUrls = async () => {
    const { data: competitors } = await supabase
      .from('competitors')
      .select('id, user_id, name')
      .in('user_id', Array.from(selected));

    if (!competitors?.length) return null;

    const competitorIds = competitors.map(c => c.id);
    const competitorMap = new Map(competitors.map(c => [c.id, c]));

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
      if (isoFilter) query = query.gte('captured_at', isoFilter);
      const { data } = await query;
      if (data) allScreenshots = [...allScreenshots, ...data];
    }

    // Batch sign URLs (50 at a time)
    const signedUrlMap = new Map<string, string>();
    const paths = allScreenshots.map(s => s.storage_path);
    for (let i = 0; i < paths.length; i += 50) {
      const batch = paths.slice(i, i + 50);
      const { data } = await supabase.storage
        .from('screenshots')
        .createSignedUrls(batch, 600);
      if (data) {
        data.forEach(item => {
          if (item.signedUrl && !item.error) {
            signedUrlMap.set(item.path!, item.signedUrl);
          }
        });
      }
    }

    return { allScreenshots, competitorMap, signedUrlMap };
  };

  const makeFilename = (name: string, capturedAt: string, index: number) => {
    const dateStr = format(new Date(capturedAt), 'yyyy-MM-dd-HH-mm');
    return `${name}-${dateStr}-segment-${index + 1}.webm`;
  };

  const handleDownloadFiles = async () => {
    if (selected.size === 0) return;
    setDownloading(true);
    setDownloadMode('files');
    progressRef.current = 0;

    try {
      const result = await fetchSegmentsWithUrls();
      if (!result) return;
      const { allScreenshots, competitorMap, signedUrlMap } = result;
      setProgress({ current: 0, total: allScreenshots.length });

      await pooledMap(
        allScreenshots,
        async (screenshot, i) => {
          const competitor = competitorMap.get(screenshot.competitor_id);
          const name = competitor?.name || 'unknown';
          const url = signedUrlMap.get(screenshot.storage_path);

          if (url) {
            try {
              const response = await fetch(url);
              const blob = await response.blob();
              const objUrl = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = objUrl;
              a.download = makeFilename(name, screenshot.captured_at, i);
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              setTimeout(() => URL.revokeObjectURL(objUrl), 2000);
            } catch (err) {
              console.error(`Failed to download segment ${i + 1}:`, err);
            }
          }
        },
        CONCURRENCY,
        () => {
          progressRef.current++;
          setProgress(p => ({ ...p, current: progressRef.current }));
        },
      );
    } finally {
      setDownloading(false);
      setDownloadMode(null);
    }
  };

  const handleDownloadZip = async () => {
    if (selected.size === 0) return;
    setDownloading(true);
    setDownloadMode('zip');
    progressRef.current = 0;

    try {
      const result = await fetchSegmentsWithUrls();
      if (!result) return;
      const { allScreenshots, competitorMap, signedUrlMap } = result;
      setProgress({ current: 0, total: allScreenshots.length });

      const zip = new JSZip();

      await pooledMap(
        allScreenshots,
        async (screenshot, i) => {
          const competitor = competitorMap.get(screenshot.competitor_id);
          const name = competitor?.name || 'unknown';
          const url = signedUrlMap.get(screenshot.storage_path);

          if (url) {
            try {
              const response = await fetch(url);
              const blob = await response.blob();
              const folder = zip.folder(name)!;
              folder.file(makeFilename(name, screenshot.captured_at, i), blob);
            } catch (err) {
              console.error(`Failed to fetch segment ${i + 1}:`, err);
            }
          }
        },
        CONCURRENCY,
        () => {
          progressRef.current++;
          setProgress(p => ({ ...p, current: progressRef.current }));
        },
      );

      setProgress({ current: -1, total: 0 });
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `recordings-${format(new Date(), 'yyyy-MM-dd-HHmm')}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } finally {
      setDownloading(false);
      setDownloadMode(null);
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
            {progress.current === -1 ? (
              <>
                <Progress value={100} />
                <p className="text-xs text-muted-foreground text-center">Creating ZIP...</p>
              </>
            ) : (
              <>
                <Progress value={(progress.current / progress.total) * 100} />
                <p className="text-xs text-muted-foreground text-center">
                  {downloadMode === 'zip' ? 'Fetching' : 'Downloading'} {progress.current} of {progress.total} segments...
                </p>
              </>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={downloading}>
            Cancel
          </Button>
          <Button
            onClick={handleDownloadFiles}
            disabled={selected.size === 0 || downloading}
            variant="outline"
            className="gap-2"
          >
            {downloading && downloadMode === 'files' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Files
          </Button>
          <Button
            onClick={handleDownloadZip}
            disabled={selected.size === 0 || downloading}
            className="gap-2"
          >
            {downloading && downloadMode === 'zip' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Archive className="h-4 w-4" />
            )}
            ZIP {totalSelectedSegments > 0 ? `(${totalSelectedSegments})` : ''}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
