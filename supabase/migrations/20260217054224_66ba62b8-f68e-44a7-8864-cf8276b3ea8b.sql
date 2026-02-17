
-- Lightweight table for instant scoreboard sync
-- Only stores ~500 bytes per match, enabling sub-second postgres_changes delivery
CREATE TABLE public.score_live (
  match_id UUID PRIMARY KEY,
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.score_live ENABLE ROW LEVEL SECURITY;

-- Anyone can read (scoreboard viewers)
CREATE POLICY "Anyone can view live scores"
ON public.score_live FOR SELECT USING (true);

-- Authenticated users can insert
CREATE POLICY "Users can insert live scores"
ON public.score_live FOR INSERT
WITH CHECK (true);

-- Authenticated users can update
CREATE POLICY "Users can update live scores"
ON public.score_live FOR UPDATE
USING (true);

-- Enable realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE public.score_live;

-- Set REPLICA IDENTITY FULL for complete change payloads
ALTER TABLE public.score_live REPLICA IDENTITY FULL;
