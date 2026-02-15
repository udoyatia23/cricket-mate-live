-- Allow anyone to SELECT matches (for public scoreboard viewing)
DROP POLICY IF EXISTS "Users can view own matches" ON public.matches;

CREATE POLICY "Anyone can view matches"
  ON public.matches FOR SELECT
  USING (true);

-- Allow anyone to update display_state column only (for public scoreboard sync)
-- Owner can update everything
DROP POLICY IF EXISTS "Users can update own matches" ON public.matches;

CREATE POLICY "Owner can update own matches"
  ON public.matches FOR UPDATE
  USING (auth.uid() = owner_id);
