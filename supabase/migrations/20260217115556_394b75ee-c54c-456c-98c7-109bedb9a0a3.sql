
-- ========== score_live ==========
DROP POLICY IF EXISTS "score_live_select_public" ON public.score_live;
DROP POLICY IF EXISTS "score_live_insert_public" ON public.score_live;
DROP POLICY IF EXISTS "score_live_update_public" ON public.score_live;
DROP POLICY IF EXISTS "Anyone can view live scores" ON public.score_live;
DROP POLICY IF EXISTS "Authenticated users can insert live scores" ON public.score_live;
DROP POLICY IF EXISTS "Authenticated users can update live scores" ON public.score_live;

CREATE POLICY "score_live_select" ON public.score_live FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "score_live_insert" ON public.score_live FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "score_live_update" ON public.score_live FOR UPDATE TO anon, authenticated USING (true);

-- ========== matches ==========
DROP POLICY IF EXISTS "matches_select_public" ON public.matches;
DROP POLICY IF EXISTS "matches_insert_owner" ON public.matches;
DROP POLICY IF EXISTS "matches_update_owner" ON public.matches;
DROP POLICY IF EXISTS "matches_delete_owner" ON public.matches;
DROP POLICY IF EXISTS "Anyone can view matches" ON public.matches;

CREATE POLICY "matches_select" ON public.matches FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "matches_insert" ON public.matches FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "matches_update" ON public.matches FOR UPDATE TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "matches_delete" ON public.matches FOR DELETE TO authenticated USING (auth.uid() = owner_id);

-- ========== tournaments ==========
DROP POLICY IF EXISTS "tournaments_select_own" ON public.tournaments;
DROP POLICY IF EXISTS "tournaments_insert_own" ON public.tournaments;
DROP POLICY IF EXISTS "tournaments_update_own" ON public.tournaments;
DROP POLICY IF EXISTS "tournaments_delete_own" ON public.tournaments;

CREATE POLICY "tournaments_select" ON public.tournaments FOR SELECT TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "tournaments_insert" ON public.tournaments FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "tournaments_update" ON public.tournaments FOR UPDATE TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "tournaments_delete" ON public.tournaments FOR DELETE TO authenticated USING (auth.uid() = owner_id);

-- ========== profiles ==========
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;

CREATE POLICY "profiles_select" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
