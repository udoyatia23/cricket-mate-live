-- Add scoreboard unlock columns to user_access table
ALTER TABLE public.user_access 
  ADD COLUMN IF NOT EXISTS sb2_unlocked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sb3_unlocked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sb4_unlocked boolean NOT NULL DEFAULT false;