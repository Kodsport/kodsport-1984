

## Make ellinor.ahlander@kodsport.se an Admin

**User verified:** Ellinor Åhlander — `96634aea-fa3d-49f2-bc4a-80537a603788`. Confirmed no existing role in `user_roles`.

### Action
Single SQL insert via the insert tool:

```sql
INSERT INTO public.user_roles (user_id, role)
VALUES ('96634aea-fa3d-49f2-bc4a-80537a603788', 'admin');
```

Then verify with a SELECT to confirm the row exists.

One insert, one verification. No code changes needed.

