-- Enable Realtime authorization for broadcast channels
-- Only admins can receive broadcast messages on live-screenshots channels
CREATE POLICY "Only admins can receive realtime broadcasts"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (
    SELECT 1 FROM public.competitors
    WHERE competitors.user_id = auth.uid()
    AND competitors.status = 'online'
  )
);