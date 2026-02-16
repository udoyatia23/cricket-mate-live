-- Drop the restrictive SELECT policy and recreate as PERMISSIVE
DROP POLICY IF EXISTS "Anyone can view matches" ON public.matches;

CREATE POLICY "Anyone can view matches"
ON public.matches
FOR SELECT
USING (true);
