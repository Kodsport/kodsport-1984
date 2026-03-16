

## Security Audit Results

### Vulnerabilities Found

**1. CRITICAL: `discord-alert` function lacks caller authorization**
The `discord-alert` edge function (called by competitors when devtools are detected) only checks that the caller is authenticated — any logged-in user can call it with arbitrary `competitorName`, `room`, and `type` values. A malicious competitor could spam Discord with fake alerts or frame other users. This was flagged in the previous audit but not yet fixed.

**Fix:** Add validation that the caller either owns the competitor record referenced, or restrict the function to admin-only. For devtools alerts from competitors, verify the caller's `user.id` matches a valid online competitor and use server-side data for `competitorName`/`room` instead of trusting the request body.

**2. CRITICAL: Edge functions missing `verify_jwt = false` in config.toml**
The `supabase/config.toml` only contains `project_id`. Per the signing-keys system, the default `verify_jwt = true` is deprecated and broken. Both `discord-alert` and `check-competitors` functions need `verify_jwt = false` with in-code JWT validation (which they already do, but the config may cause requests to fail silently).

**Fix:** Add to `supabase/config.toml`:
```toml
[functions.discord-alert]
verify_jwt = false

[functions.check-competitors]
verify_jwt = false
```

**3. HIGH: `rooms` table write policies are insufficient**
The RLS policy "Admins can manage rooms" uses `FOR ALL` which is correct, but there is no explicit DENY for non-admin writes. The `FOR ALL` policy is permissive — since there are no other INSERT/UPDATE/DELETE policies, non-admin authenticated users are blocked. However, this relies on implicit denial. Security scan flagged this.

**Fix:** This is actually secure as-is (RLS defaults to deny). No change needed, but worth noting.

**4. HIGH: `user_roles` table has no write-protection RLS policies**
The `user_roles` table has RLS enabled but only a SELECT policy. There are no INSERT/UPDATE/DELETE policies. This means no user can modify roles via the API (default deny), which is correct. However, it also means even admins cannot manage roles through the app — they must use the backend directly. The security scan flagged this as an error because if someone accidentally adds a permissive INSERT policy later, it could lead to privilege escalation.

**Fix:** Add explicit admin-only write policies for defense-in-depth:
```sql
CREATE POLICY "Admins can manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'));
```

**5. MEDIUM: Leaked password protection is disabled**
The security scan confirms this is still off. This allows users to sign up with passwords known to be in breach databases.

**Fix:** Must be manually enabled in the authentication security settings (cannot be done via code).

**6. MEDIUM: Competitor `admin-alerts` channel is spoofable**
In `CompetitorCapture.tsx` (line 38-54), any authenticated user can broadcast to the `admin-alerts` channel with arbitrary payload data (fake names, fake alert types). The realtime RLS restricts who can *listen*, but any user can *send* broadcast messages.

**Fix:** Move alert sending to server-side (edge function) so the competitor client never directly writes to the admin-alerts channel. The `discord-alert` function already exists — extend it to also broadcast the realtime alert server-side.

**7. LOW: DevTools detection is easily bypassable**
The `useDevToolsDetection` hook uses `outerWidth - innerWidth > 160` and a console.log getter trick. Both are unreliable:
- Undocked devtools don't change window dimensions
- The console.log trick doesn't work in all browsers
- A competitor could simply use a separate browser profile or disable the getter

**Note:** This is inherent to client-side detection and can't be fully solved. The current approach is "best effort" which is fine, but admins should be aware it's not foolproof.

**8. LOW: No rate limiting on competitor record creation**
A malicious user could spam `competitors` INSERT to create thousands of records (they have INSERT permission for their own `user_id`). No rate limiting exists.

**Fix:** Add a database trigger or function that limits active competitor records per user.

---

### Recommended Fix Priority

1. **Fix config.toml** — add `verify_jwt = false` for both edge functions (quick, prevents potential silent failures)
2. **Harden `discord-alert`** — validate caller owns the competitor, use server-side data for names
3. **Move `admin-alerts` broadcast to server-side** — prevent client-side spoofing
4. **Add admin-only write policies to `user_roles`** — defense-in-depth
5. **Enable leaked password protection** — manual step in auth settings

### Files to modify
- `supabase/config.toml` — add function configs
- `supabase/functions/discord-alert/index.ts` — add authorization + server-side alert broadcast
- `src/components/CompetitorCapture.tsx` — remove direct `admin-alerts` broadcast (move to edge function)
- `src/hooks/useScreenCapture.tsx` — remove direct `admin-alerts` broadcast from `stopCapture`
- Database migration — add write policies to `user_roles`

