-- Defense-in-depth: explicit admin-only write policies for user_roles
CREATE POLICY "Admins can manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Rate limit: max 3 active (online/inactive) competitor records per user
CREATE OR REPLACE FUNCTION public.check_competitor_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF (
    SELECT count(*)
    FROM public.competitors
    WHERE user_id = NEW.user_id
      AND status IN ('online', 'inactive')
  ) >= 3 THEN
    RAISE EXCEPTION 'Too many active competitor sessions. Please stop existing sessions first.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_competitor_rate_limit
  BEFORE INSERT ON public.competitors
  FOR EACH ROW
  EXECUTE FUNCTION public.check_competitor_rate_limit();