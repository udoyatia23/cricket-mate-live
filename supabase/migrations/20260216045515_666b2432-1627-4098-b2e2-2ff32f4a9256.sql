-- Fix RLS policies - they are all RESTRICTIVE which is wrong
-- Drop and recreate as PERMISSIVE

DROP POLICY IF EXISTS "Anyone can view matches" ON public.matches;
DROP POLICY IF EXISTS "Owner can update own matches" ON public.matches;
DROP POLICY IF EXISTS "Users can delete own matches" ON public.matches;
DROP POLICY IF EXISTS "Users can insert own matches" ON public.matches;

CREATE POLICY "Anyone can view matches" ON public.matches FOR SELECT USING (true);
CREATE POLICY "Owner can update own matches" ON public.matches FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "Users can delete own matches" ON public.matches FOR DELETE USING (auth.uid() = owner_id);
CREATE POLICY "Users can insert own matches" ON public.matches FOR INSERT WITH CHECK (auth.uid() = owner_id);

-- Also fix tournaments policies
DROP POLICY IF EXISTS "Users can view own tournaments" ON public.tournaments;
DROP POLICY IF EXISTS "Users can update own tournaments" ON public.tournaments;
DROP POLICY IF EXISTS "Users can delete own tournaments" ON public.tournaments;
DROP POLICY IF EXISTS "Users can insert own tournaments" ON public.tournaments;

CREATE POLICY "Users can view own tournaments" ON public.tournaments FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "Users can update own tournaments" ON public.tournaments FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "Users can delete own tournaments" ON public.tournaments FOR DELETE USING (auth.uid() = owner_id);
CREATE POLICY "Users can insert own tournaments" ON public.tournaments FOR INSERT WITH CHECK (auth.uid() = owner_id);
