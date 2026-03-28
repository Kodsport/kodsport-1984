

## Make ruth.risberg@kodsport.se an Admin

**User verified:** Ruth Risberg — `bd739dc0-336c-44fc-9f99-3ed1c28b3290`. Confirmed no existing role in `user_roles`.

### Action
Single SQL insert:

```sql
INSERT INTO public.user_roles (user_id, role)
VALUES ('bd739dc0-336c-44fc-9f99-3ed1c28b3290', 'admin');
```

Then verify with a SELECT to confirm the row exists.

One insert, one verification. No code changes needed.

