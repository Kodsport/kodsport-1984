

## Plan: Reduce rate limiting from shared IP

### Root cause
Every competitor broadcasts a screenshot **every 500ms**, and each broadcast also calls `supabase.from('competitors').update(...)` to update `last_seen`. With 20+ competitors on one IP, that's 40+ REST API requests/second from the same IP — triggering rate limits.

### Changes

1. **`src/hooks/useScreenCapture.tsx`** — Decouple the `last_seen` heartbeat from the broadcast interval:
   - Keep `BROADCAST_INTERVAL_MS = 500` for live screenshots (these use WebSocket/Realtime, not REST API, so they don't count toward rate limits).
   - Add a separate `HEARTBEAT_INTERVAL_MS = 10000` (every 10 seconds) for the `last_seen` database update.
   - Move the `supabase.from('competitors').update(...)` call out of `broadcastScreenshot` and into its own interval that runs every 10 seconds.

2. **`supabase/functions/check-competitors/index.ts`** — Increase `STALE_THRESHOLD_SECONDS` from `30` to `60` to match the less-frequent heartbeat (competitors now update every 10s, so 60s gives plenty of buffer before marking offline).

This eliminates ~95% of the REST API calls from competitors while keeping the live view smooth.

