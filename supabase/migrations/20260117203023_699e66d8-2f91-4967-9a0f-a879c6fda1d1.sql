-- Create enum for competitor status
CREATE TYPE public.competitor_status AS ENUM ('online', 'offline', 'inactive');

-- Create competitors table to track active participants
CREATE TABLE public.competitors (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    session_id TEXT NOT NULL,
    status competitor_status NOT NULL DEFAULT 'inactive',
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT now(),
    started_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    ended_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(session_id)
);

-- Create screenshots table for storing capture references
CREATE TABLE public.screenshots (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    competitor_id UUID REFERENCES public.competitors(id) ON DELETE CASCADE NOT NULL,
    storage_path TEXT NOT NULL,
    captured_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create app_role enum for admin roles
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

-- Create user_roles table
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL,
    UNIQUE (user_id, role)
);

-- Enable RLS
ALTER TABLE public.competitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.screenshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Competitors policies
-- Users can view their own competitor record
CREATE POLICY "Users can view own competitor"
ON public.competitors FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own competitor record
CREATE POLICY "Users can insert own competitor"
ON public.competitors FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own competitor record
CREATE POLICY "Users can update own competitor"
ON public.competitors FOR UPDATE
USING (auth.uid() = user_id);

-- Admins can view all competitors
CREATE POLICY "Admins can view all competitors"
ON public.competitors FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- Admins can update any competitor
CREATE POLICY "Admins can update any competitor"
ON public.competitors FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));

-- Screenshots policies
-- Users can insert their own screenshots
CREATE POLICY "Users can insert own screenshots"
ON public.screenshots FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.competitors
        WHERE id = competitor_id AND user_id = auth.uid()
    )
);

-- Users can view their own screenshots
CREATE POLICY "Users can view own screenshots"
ON public.screenshots FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.competitors
        WHERE id = competitor_id AND user_id = auth.uid()
    )
);

-- Admins can view all screenshots
CREATE POLICY "Admins can view all screenshots"
ON public.screenshots FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- User roles policies
CREATE POLICY "Users can view own role"
ON public.user_roles FOR SELECT
USING (auth.uid() = user_id);

-- Create storage bucket for screenshots
INSERT INTO storage.buckets (id, name, public)
VALUES ('screenshots', 'screenshots', false);

-- Storage policies for screenshots bucket
CREATE POLICY "Users can upload own screenshots"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'screenshots' AND
    auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Admins can view all screenshots"
ON storage.objects FOR SELECT
USING (
    bucket_id = 'screenshots' AND
    public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Users can view own screenshots storage"
ON storage.objects FOR SELECT
USING (
    bucket_id = 'screenshots' AND
    auth.uid()::text = (storage.foldername(name))[1]
);

-- Enable realtime for competitors table
ALTER PUBLICATION supabase_realtime ADD TABLE public.competitors;
ALTER PUBLICATION supabase_realtime ADD TABLE public.screenshots;