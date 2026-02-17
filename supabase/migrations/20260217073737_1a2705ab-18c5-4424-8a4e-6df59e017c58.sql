
-- Fix score_live: Drop RESTRICTIVE policies and recreate as PERMISSIVE
DROP POLICY IF EXISTS "Anyone can view live scores" ON public.score_live;
DROP POLICY IF EXISTS "Users can insert live scores" ON public.score_live;
DROP POLICY IF EXISTS "Users can update live scores" ON public.score_live;

CREATE POLICY "Anyone can view live scores"
  ON public.score_live FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert live scores"
  ON public.score_live FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update live scores"
  ON public.score_live FOR UPDATE
  USING (true);

-- Fix matches: Drop RESTRICTIVE SELECT and recreate as PERMISSIVE
DROP POLICY IF EXISTS "Anyone can view matches" ON public.matches;

CREATE POLICY "Anyone can view matches"
  ON public.matches FOR SELECT
  USING (true);
