
ALTER TABLE public.competitors DROP CONSTRAINT IF EXISTS valid_room;
UPDATE public.competitors SET room = 'Kammaren' WHERE room IS DISTINCT FROM 'Kammaren';
ALTER TABLE public.competitors ALTER COLUMN room SET DEFAULT 'Kammaren';
ALTER TABLE public.competitors ADD CONSTRAINT valid_room CHECK (room IN ('Kammaren'));
