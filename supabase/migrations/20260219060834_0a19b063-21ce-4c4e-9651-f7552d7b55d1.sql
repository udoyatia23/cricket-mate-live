
-- Fix score_live security: keep public SELECT but restrict write to match owners only

-- Drop the insecure permissive write policies
DROP POLICY IF EXISTS score_live_insert ON public.score_live;
DROP POLICY IF EXISTS score_live_update ON public.score_live;
DROP POLICY IF EXISTS score_live_delete ON public.score_live;

-- New: Only the match owner can INSERT a score_live row
CREATE POLICY "score_live_insert_owner"
ON public.score_live
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.matches
    WHERE matches.id = match_id
      AND matches.owner_id = auth.uid()
  )
);

-- New: Only the match owner can UPDATE score_live
CREATE POLICY "score_live_update_owner"
ON public.score_live
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.matches
    WHERE matches.id = match_id
      AND matches.owner_id = auth.uid()
  )
);

-- New: Only the match owner can DELETE score_live (e.g. when match is deleted)
CREATE POLICY "score_live_delete_owner"
ON public.score_live
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.matches
    WHERE matches.id = match_id
      AND matches.owner_id = auth.uid()
  )
);
