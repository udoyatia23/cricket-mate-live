
-- Add sb5_unlocked column to user_access table
ALTER TABLE public.user_access ADD COLUMN IF NOT EXISTS sb5_unlocked boolean NOT NULL DEFAULT false;
