
-- Add display_state column to matches table for scoreboard sync
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS display_state jsonb DEFAULT '{"mode":"default","overlay":"none","timestamp":0}'::jsonb;
