-- Add room column to competitors table
ALTER TABLE public.competitors
ADD COLUMN room text DEFAULT 'Rum 41';

-- Add check constraint for valid rooms
ALTER TABLE public.competitors
ADD CONSTRAINT valid_room CHECK (room IN ('Rum 41', 'Rum 43'));