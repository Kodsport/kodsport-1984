-- Drop the previous policy and create tighter ones
DROP POLICY "Only admins can receive realtime broadcasts" ON realtime.messages;

-- Only admins can SELECT (receive/listen to) broadcast messages
CREATE POLICY "Only admins can listen to broadcasts"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
);

-- Competitors can INSERT (send) broadcast messages when they're online
CREATE POLICY "Online competitors can send broadcasts"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.competitors
    WHERE competitors.user_id = auth.uid()
    AND competitors.status = 'online'
  )
);