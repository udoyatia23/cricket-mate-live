
-- Drop ALL existing policies
DROP POLICY IF EXISTS "score_live_select" ON public.score_live;
DROP POLICY IF EXISTS "score_live_insert" ON public.score_live;
DROP POLICY IF EXISTS "score_live_update" ON public.score_live;

DROP POLICY IF EXISTS "matches_select" ON public.matches;
DROP POLICY IF EXISTS "matches_insert" ON public.matches;
DROP POLICY IF EXISTS "matches_update" ON public.matches;
DROP POLICY IF EXISTS "matches_delete" ON public.matches;

DROP POLICY IF EXISTS "tournaments_select" ON public.tournaments;
DROP POLICY IF EXISTS "tournaments_insert" ON public.tournaments;
DROP POLICY IF EXISTS "tournaments_update" ON public.tournaments;
DROP POLICY IF EXISTS "tournaments_delete" ON public.tournaments;

DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update" ON public.profiles;

-- Recreate as explicitly PERMISSIVE

CREATE POLICY "score_live_select" ON public.score_live AS PERMISSIVE FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "score_live_insert" ON public.score_live AS PERMISSIVE FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "score_live_update" ON public.score_live AS PERMISSIVE FOR UPDATE TO anon, authenticated USING (true);

CREATE POLICY "matches_select" ON public.matches AS PERMISSIVE FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "matches_insert" ON public.matches AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "matches_update" ON public.matches AS PERMISSIVE FOR UPDATE TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "matches_delete" ON public.matches AS PERMISSIVE FOR DELETE TO authenticated USING (auth.uid() = owner_id);

CREATE POLICY "tournaments_select" ON public.tournaments AS PERMISSIVE FOR SELECT TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "tournaments_insert" ON public.tournaments AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "tournaments_update" ON public.tournaments AS PERMISSIVE FOR UPDATE TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "tournaments_delete" ON public.tournaments AS PERMISSIVE FOR DELETE TO authenticated USING (auth.uid() = owner_id);

CREATE POLICY "profiles_select" ON public.profiles AS PERMISSIVE FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_insert" ON public.profiles AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update" ON public.profiles AS PERMISSIVE FOR UPDATE TO authenticated USING (auth.uid() = id);
