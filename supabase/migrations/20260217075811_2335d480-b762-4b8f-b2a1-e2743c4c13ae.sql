
-- =====================================================
-- FIX: All score_live and matches policies are STILL RESTRICTIVE
-- PostgreSQL default for CREATE POLICY is PERMISSIVE,
-- but existing ones were created as RESTRICTIVE.
-- We must DROP all and recreate explicitly as PERMISSIVE.
-- =====================================================

-- 1. score_live: Drop ALL existing policies
DROP POLICY IF EXISTS "Anyone can view live scores" ON public.score_live;
DROP POLICY IF EXISTS "Anyone can insert live scores" ON public.score_live;
DROP POLICY IF EXISTS "Anyone can update live scores" ON public.score_live;
DROP POLICY IF EXISTS "Users can update live scores" ON public.score_live;
DROP POLICY IF EXISTS "Users can insert live scores" ON public.score_live;
DROP POLICY IF EXISTS "score_live_read_public" ON public.score_live;

-- Recreate as PERMISSIVE (explicit) for anon + authenticated
CREATE POLICY "score_live_select_public"
  ON public.score_live FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "score_live_insert_public"
  ON public.score_live FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "score_live_update_public"
  ON public.score_live FOR UPDATE
  TO anon, authenticated
  USING (true);

-- 2. matches: Fix SELECT policy (must be PERMISSIVE for scoreboard)
DROP POLICY IF EXISTS "Anyone can view matches" ON public.matches;

CREATE POLICY "matches_select_public"
  ON public.matches FOR SELECT
  TO anon, authenticated
  USING (true);

-- 3. matches: Fix remaining RESTRICTIVE policies for owners
DROP POLICY IF EXISTS "Owner can update own matches" ON public.matches;
DROP POLICY IF EXISTS "Users can delete own matches" ON public.matches;
DROP POLICY IF EXISTS "Users can insert own matches" ON public.matches;

CREATE POLICY "matches_insert_owner"
  ON public.matches FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "matches_update_owner"
  ON public.matches FOR UPDATE
  TO authenticated
  USING (auth.uid() = owner_id);

CREATE POLICY "matches_delete_owner"
  ON public.matches FOR DELETE
  TO authenticated
  USING (auth.uid() = owner_id);

-- 4. profiles: Fix RESTRICTIVE policies
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

-- 5. tournaments: Fix RESTRICTIVE policies
DROP POLICY IF EXISTS "Users can view own tournaments" ON public.tournaments;
DROP POLICY IF EXISTS "Users can update own tournaments" ON public.tournaments;
DROP POLICY IF EXISTS "Users can delete own tournaments" ON public.tournaments;
DROP POLICY IF EXISTS "Users can insert own tournaments" ON public.tournaments;

CREATE POLICY "tournaments_select_own"
  ON public.tournaments FOR SELECT
  TO authenticated
  USING (auth.uid() = owner_id);

CREATE POLICY "tournaments_insert_own"
  ON public.tournaments FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "tournaments_update_own"
  ON public.tournaments FOR UPDATE
  TO authenticated
  USING (auth.uid() = owner_id);

CREATE POLICY "tournaments_delete_own"
  ON public.tournaments FOR DELETE
  TO authenticated
  USING (auth.uid() = owner_id);
