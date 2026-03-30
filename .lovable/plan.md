

## Speed Up BulkDownloader

### Problem
Two major bottlenecks:
1. **Initial load**: Segment counts are fetched sequentially — one query per user in a `for` loop. With 20 users, that's 20 serial round trips.
2. **Download phase**: Signed URLs are created and blobs fetched one at a time, sequentially. Each segment = 1 signed URL request + 1 blob fetch, all in series.

### Solution: Parallelize everything

**Modified: `src/components/BulkDownloader.tsx`**

1. **Parallel segment count fetching** (initial load)
   - Replace the sequential `for...of` loop with `Promise.all` — fire all count queries concurrently.
   - This turns N serial requests into N parallel requests.

2. **Parallel segment downloads** (both Files and ZIP modes)
   - Use a concurrency-limited parallel fetcher (e.g., process 5 segments at a time using a simple semaphore/pool pattern).
   - For each batch of 5: create signed URL + fetch blob concurrently, then move to next batch.
   - Update progress counter after each individual segment completes.

3. **Batch signed URL creation**
   - Supabase supports `createSignedUrls` (plural) — pass an array of paths and get all URLs in one request instead of one-at-a-time.
   - Call `createSignedUrls` in batches of ~50 paths, then fetch blobs with the concurrency pool.

### Technical Details

```text
Before:  count1 → count2 → count3 → ... → countN  (serial)
After:   count1, count2, count3, ..., countN        (parallel)

Before:  sign+fetch1 → sign+fetch2 → ...           (serial)
After:   signUrls[0..49] → fetch×5 concurrently     (batched + parallel)
```

- `createSignedUrls(paths, 300)` returns all signed URLs in one call per batch
- Concurrency pool: simple async queue processing 5 fetches at a time
- No new dependencies needed
- Progress bar updates remain per-segment for smooth UX

