

## Make julia.martensson@ungvetenskapssport.se an Admin

**User found:** `e4b52372-e6e9-4152-90f3-f5c719391dcb` — confirmed no existing role in `user_roles`.

### Action
Run a single SQL insert via database migration tool:

```sql
INSERT INTO public.user_roles (user_id, role)
VALUES ('e4b52372-e6e9-4152-90f3-f5c719391dcb', 'admin');
```

Then verify with a SELECT query to confirm the row exists.

That's it — one insert, one verification. No code changes needed.

