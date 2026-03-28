

## Make hugoback01@outlook.com an Admin

**User verified:** Hugo Bäckman — `02e27712-c452-4998-ac48-55223d2a3146`. Confirmed no existing role in `user_roles`.

### Action
Single SQL insert:

```sql
INSERT INTO public.user_roles (user_id, role)
VALUES ('02e27712-c452-4998-ac48-55223d2a3146', 'admin');
```

Then verify with a SELECT to confirm the row exists.

One insert, one verification. No code changes needed.

