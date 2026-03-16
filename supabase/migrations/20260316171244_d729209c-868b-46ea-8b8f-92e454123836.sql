
-- Create rooms table
CREATE TABLE public.rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

-- Everyone can read active rooms
CREATE POLICY "Anyone can view active rooms" ON public.rooms
  FOR SELECT TO authenticated USING (is_active = true);

-- Admins can do everything
CREATE POLICY "Admins can manage rooms" ON public.rooms
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- Seed current rooms
INSERT INTO public.rooms (name) VALUES ('Chalmers'), ('KTH'), ('LTH');

-- Drop old hardcoded constraint
ALTER TABLE public.competitors DROP CONSTRAINT IF EXISTS valid_room;

-- Remove hardcoded default
ALTER TABLE public.competitors ALTER COLUMN room DROP DEFAULT;
