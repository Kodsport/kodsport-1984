

## Plan: Database-driven Room Management

Instead of hardcoding rooms in multiple files (and needing a DB constraint update each time), store rooms in a `rooms` table and fetch them dynamically.

### Database Changes

**1. Create `rooms` table**
```sql
CREATE TABLE public.rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

-- Everyone can read rooms (needed for room selector)
CREATE POLICY "Anyone can view active rooms" ON public.rooms
  FOR SELECT TO authenticated USING (is_active = true);

-- Only admins can manage rooms
CREATE POLICY "Admins can manage rooms" ON public.rooms
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));

-- Seed current rooms
INSERT INTO public.rooms (name) VALUES ('Chalmers'), ('KTH'), ('LTH');
```

**2. Drop the hardcoded `valid_room` CHECK constraint on `competitors`**
```sql
ALTER TABLE public.competitors DROP CONSTRAINT IF EXISTS valid_room;
```
No new constraint needed — room validity is enforced by the UI only showing rooms from the `rooms` table.

**3. Update `competitors.room` default**
```sql
ALTER TABLE public.competitors ALTER COLUMN room DROP DEFAULT;
```
Room will always be explicitly selected.

### Frontend Changes

**4. Create `src/hooks/useRooms.ts`**
- Fetches active rooms from `rooms` table
- Returns `{ rooms: string[], loading: boolean }`
- Used by both `AdminDashboard` and `CompetitorCapture`

**5. Update `src/components/CompetitorCapture.tsx`**
- Remove hardcoded `ROOMS` constant
- Use `useRooms()` hook instead
- Room selector populates from DB

**6. Update `src/components/AdminDashboard.tsx`**
- Remove hardcoded `ROOMS` constant
- Use `useRooms()` hook
- Tab list and realtime channel subscriptions driven by fetched rooms

**7. Update `src/hooks/useScreenCapture.tsx`**
- Remove hardcoded `'Chalmers'` default — room is always passed explicitly

**8. Add Room Management UI for admins**
- New `src/components/RoomManager.tsx` component
- Simple list with add/rename/deactivate controls
- Accessible from a new tab in the admin dashboard
- Add room: text input + button
- Rename room: inline edit
- Deactivate room: toggle (soft delete, preserves historical data)

### Files to create/modify
- **Create**: `src/hooks/useRooms.ts`, `src/components/RoomManager.tsx`
- **Modify**: `src/components/AdminDashboard.tsx`, `src/components/CompetitorCapture.tsx`, `src/hooks/useScreenCapture.tsx`
- **Database**: 1 migration (create table, drop constraint, seed data)

