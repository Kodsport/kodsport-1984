

## Plan: Automated 7-Day Cleanup via Scheduled Edge Function

### Overview
Create a scheduled edge function that runs daily and:
1. Deletes recordings (screenshots table rows + storage files) older than 7 days
2. Deletes non-admin user accounts and all associated data older than 7 days

### Database Changes

**1. Migration: Enable `pg_cron` and `pg_net` extensions**
```sql
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
```

**2. Cleanup function in public schema** (called by the edge function via service role)
No DB function needed — the edge function will handle all logic directly using the service client.

### New Edge Function: `supabase/functions/cleanup-old-data/index.ts`

This function will:

**Step A — Delete old recordings:**
1. Query `screenshots` where `captured_at < now() - 7 days`
2. For each batch, delete the storage files from the `screenshots` bucket using `storage.from('screenshots').remove([paths])`
3. Delete the `screenshots` rows

**Step B — Delete old non-admin users and associated data:**
1. Query all users from `auth.admin.listUsers()` created > 7 days ago
2. For each user, check `user_roles` — skip if they have an `admin` role
3. For non-admin users older than 7 days:
   - Delete their storage files (query `screenshots` → `competitors` for their files)
   - Delete `screenshots` rows (cascades from competitor deletion aren't set up, so explicit delete)
   - Delete `competitors` rows
   - Delete `user_roles` rows
   - Delete the auth user via `auth.admin.deleteUser(userId)`

**Important ordering:** Storage files first → screenshot rows → competitor rows → user_roles rows → auth user

**Authentication:** The function runs on a schedule with the anon key, so it uses `verify_jwt = false` and validates via a shared secret or simply skips auth (it's a cron-only endpoint). We'll add a `CLEANUP_SECRET` header check to prevent external calls.

### Config Changes

**`supabase/config.toml`** — add:
```toml
[functions.cleanup-old-data]
verify_jwt = false
```

### Scheduling (via pg_cron — data insert, not migration)

Use the insert tool to create a daily cron job:
```sql
SELECT cron.schedule(
  'cleanup-old-data-daily',
  '0 3 * * *',  -- 3 AM UTC daily
  $$
  SELECT net.http_post(
    url := 'https://lagqqmgplrhxtygmorht.supabase.co/functions/v1/cleanup-old-data',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer <anon_key>"}'::jsonb,
    body := '{"source": "cron"}'::jsonb
  ) AS request_id;
  $$
);
```

### Security Considerations
- The function uses the service role key internally, so it can delete auth users and bypass RLS
- External callers cannot trigger it because we check for the cron source or add a secret
- Non-admin check uses the `user_roles` table directly via service client

### Files to create/modify
- **Create**: `supabase/functions/cleanup-old-data/index.ts`
- **Modify**: `supabase/config.toml` (add function config)
- **Database**: 1 migration (enable pg_cron + pg_net), 1 data insert (schedule the cron job)

