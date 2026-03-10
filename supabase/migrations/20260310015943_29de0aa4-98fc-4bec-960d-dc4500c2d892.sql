
-- Fix security: Remove non-admin access to screenshots table
DROP POLICY "Users can view own screenshots" ON public.screenshots;

-- Fix security: Remove non-admin access to storage objects
DROP POLICY "Users can view own screenshots storage" ON storage.objects;
