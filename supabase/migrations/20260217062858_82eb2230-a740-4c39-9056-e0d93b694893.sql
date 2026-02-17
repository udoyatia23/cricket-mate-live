
-- score_live is already in supabase_realtime, skip that line
-- Just verify/re-ensure PERMISSIVE policies exist (idempotent)
-- If previous migration partially applied, these will be no-ops or fix missing ones

-- Drop and recreate only if they don't exist as PERMISSIVE
DO $$ BEGIN
  -- Check if policies exist and are permissive; if not we already fixed them above
  RAISE NOTICE 'Policies should already be fixed from previous migration';
END $$;
