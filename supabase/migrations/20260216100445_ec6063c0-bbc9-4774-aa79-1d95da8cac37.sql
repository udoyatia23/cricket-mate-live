-- Fix: Recreate SELECT policy as PERMISSIVE so anon/unauthenticated users can read matches via realtime
DROP POLICY IF EXISTS "Anyone can view matches" ON public.matches;
CREATE POLICY "Anyone can view matches" ON public.matches FOR SELECT USING (true);

-- Also fix other policies to be PERMISSIVE (default)
DROP POLICY IF EXISTS "Owner can update own matches" ON public.matches;
CREATE POLICY "Owner can update own matches" ON public.matches FOR UPDATE USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can delete own matches" ON public.matches;
CREATE POLICY "Users can delete own matches" ON public.matches FOR DELETE USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can insert own matches" ON public.matches;
CREATE POLICY "Users can insert own matches" ON public.matches FOR INSERT WITH CHECK (auth.uid() = owner_id);

-- Enable replica identity full for realtime to send complete row data
ALTER TABLE public.matches REPLICA IDENTITY FULL;