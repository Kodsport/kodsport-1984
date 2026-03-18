

## Bugs Found in Cleanup Implementation

### BUG 1: `config.toml` was never updated (CRITICAL)
The plan called for adding `verify_jwt = false` for all three edge functions (`discord-alert`, `check-competitors`, `cleanup-old-data`). The file still only contains `project_id`. This means all edge functions may fail silently due to the deprecated default JWT verification behavior.

**Fix:** Update `supabase/config.toml` to include all three function configs.

### BUG 2: Cron job was never scheduled (CRITICAL)
The migration only enables `pg_cron` and `pg_net` extensions. The actual `cron.schedule()` call to run the cleanup daily at 3 AM UTC was never executed. The cleanup function exists but will never run.

**Fix:** Use the database insert tool to run the `cron.schedule()` SQL with the project URL and anon key.

### BUG 3: Cleanup function has no caller protection (HIGH)
The function has `verify_jwt = false` (once config is fixed) and performs zero authentication or authorization. Anyone who knows the URL can trigger mass user/data deletion. The earlier plan mentioned a `CLEANUP_SECRET` but it was intentionally dropped — however no alternative protection was added.

**Fix:** Add a simple shared-secret check. The cron job sends the `SUPABASE_SERVICE_ROLE_KEY` as the Authorization bearer (since it's an internal call). The function validates that the bearer token matches the service role key before proceeding. This ensures only internal cron calls (or someone with the service role key, who already has full access anyway) can trigger cleanup.

### BUG 4: Double screenshot deletion (LOW)
Step A deletes ALL screenshots older than 7 days. Step B then tries to delete screenshots for old users' competitors — but those were already deleted in Step A. This is harmless (queries return 0 rows) but wasteful. No fix needed, just noting it.

### Changes

1. **`supabase/config.toml`** — add `[functions.*]` blocks with `verify_jwt = false` for all three functions
2. **`supabase/functions/cleanup-old-data/index.ts`** — add authorization check (validate bearer matches service role key)
3. **Database insert** — schedule the cron job via `cron.schedule()`

