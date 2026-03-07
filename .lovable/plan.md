

## Make Rasmuswario@gmail.com admin

The user exists with ID `63d991d0-6f97-4622-bed4-23a90ad07995`. I will insert an admin role for them in the `user_roles` table:

```sql
INSERT INTO public.user_roles (user_id, role)
VALUES ('63d991d0-6f97-4622-bed4-23a90ad07995', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;
```

No code changes needed — just a data insert.

