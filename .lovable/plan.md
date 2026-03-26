

## Root Cause

The cron job has failed **every day since March 19** with:
```
ERROR: unrecognized configuration parameter "supabase.service_role_key"
```

`current_setting('supabase.service_role_key')` is not available in pg_cron's execution context on Lovable Cloud. The cron job never successfully calls the cleanup function — so nothing gets deleted.

## Fix

**Two changes needed:**

### 1. Remove auth check from the edge function
Since `verify_jwt = false` is already set, and we can't easily pass the service role key from pg_cron, the simplest secure approach is:
- Remove the bearer token authorization check from `cleanup-old-data/index.ts`
- Instead, use the anon key in the cron job (which is safe because the function uses the service role key internally via `Deno.env.get`)
- The function is not dangerous to call externally — it only deletes data older than 7 days, which is its intended behavior regardless of caller

### 2. Re-create the cron job with the anon key hardcoded
- Delete the existing failing cron job
- Create a new one using the anon key directly (since `current_setting` doesn't work):
```sql
SELECT cron.unschedule('cleanup-old-data-daily');
SELECT cron.schedule(
  'cleanup-old-data-daily',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://lagqqmgplrhxtygmorht.supabase.co/functions/v1/cleanup-old-data',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer <ANON_KEY>"}'::jsonb,
    body := '{"source": "cron"}'::jsonb
  ) as request_id;
  $$
);
```

### Files changed
- **`supabase/functions/cleanup-old-data/index.ts`** — remove the authorization check (lines 22-28)

### Why this is safe
- The function only deletes data >7 days old — calling it externally is harmless (idempotent cleanup)
- It uses the service role key internally from `Deno.env` for actual deletions
- The anon key is already public (embedded in the frontend)

