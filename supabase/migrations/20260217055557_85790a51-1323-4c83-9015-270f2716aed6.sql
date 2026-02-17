-- Ensure score_live has REPLICA IDENTITY FULL for reliable realtime
ALTER TABLE public.score_live REPLICA IDENTITY FULL;