

## Add "Start After" Timestamp Filter to Bulk Downloader

### Overview
Add a datetime picker to the BulkDownloader that lets admins set a "competition start" timestamp. Only segments captured at or after that time will be included in the download. The filtering happens server-side via the Supabase query (`.gte('captured_at', timestamp)`), so segment counts and downloads both respect the cutoff.

### Changes

**Modified: `src/components/BulkDownloader.tsx`**

1. Add a `startAfter` state (ISO string or null) with a datetime-local input labeled "Only include segments after" (defaults to empty / no filter).

2. When fetching user segment counts on load (and whenever `startAfter` changes), apply `.gte('captured_at', startAfter)` to the screenshots count query so displayed counts reflect the filter.

3. When downloading, apply the same `.gte('captured_at', startAfter)` filter to the screenshots fetch query, ensuring only post-timestamp segments are fetched and downloaded.

4. Update `totalSelectedSegments` to recalculate when `startAfter` changes (re-fetch counts or store per-user counts that respect the filter).

5. Re-fetch user entries when the timestamp changes so segment counts update live.

### UI Layout
- Place the datetime input above the user list, below the search bar
- Label: "Competition start (only segments after this time)"
- Standard `<Input type="datetime-local" />` with a clear button
- When set, segment counts next to each user update to reflect only post-cutoff segments

### Technical Details
- Server-side filtering: `.gte('captured_at', isoTimestamp)` on both the count query and the download query
- The `datetime-local` input value is converted to ISO 8601 for the Supabase query
- No database or RLS changes needed — just query parameter additions

