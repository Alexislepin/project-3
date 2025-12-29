/*
  # Fix award_xp Function Overload Issue
  
  Problem: Multiple versions of award_xp exist with different signatures,
  causing PGRST203 "function overloading can't be resolved" error.
  
  Solution:
  1. Drop ALL existing versions of award_xp (regardless of signature)
  2. Create a single, unambiguous function with signature:
     award_xp(p_user_id uuid, p_amount integer) RETURNS integer
  3. Ensure PostgREST can resolve the function call without ambiguity
  
  Last Updated: 2025-01-26
*/

-- ============================================================
-- 1. DIAGNOSTIC: List all existing award_xp functions
-- ============================================================
-- Uncomment to see what exists before cleanup:
/*
SELECT
  p.proname,
  pg_get_function_identity_arguments(p.oid) as args,
  p.oid,
  pg_get_functiondef(p.oid) as definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'award_xp'
ORDER BY args;
*/

-- ============================================================
-- 2. DROP ALL EXISTING VERSIONS (regardless of signature)
-- ============================================================

-- Drop all functions named award_xp in public schema
DO $$
DECLARE
  func_record RECORD;
BEGIN
  FOR func_record IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) as args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'award_xp'
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS public.award_xp(%s) CASCADE', func_record.args);
    RAISE NOTICE 'Dropped function: award_xp(%)', func_record.args;
  END LOOP;
END $$;

-- ============================================================
-- 3. CREATE SINGLE, UNAMBIGUOUS FUNCTION
-- ============================================================

CREATE FUNCTION public.award_xp(
  p_user_id uuid,
  p_amount integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_xp_total integer;
BEGIN
  -- Security check: only allow awarding XP to the authenticated user
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Cannot award XP to other users';
  END IF;

  -- Atomic update: increment xp_total and return the new value
  UPDATE public.user_profiles
  SET 
    xp_total = COALESCE(xp_total, 0) + p_amount,
    last_xp_at = now()
  WHERE id = p_user_id
  RETURNING xp_total INTO v_new_xp_total;

  -- If no row was updated, user doesn't exist
  IF v_new_xp_total IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  RETURN v_new_xp_total;
END;
$$;

-- ============================================================
-- 4. ADD COMMENT AND PERMISSIONS
-- ============================================================

COMMENT ON FUNCTION public.award_xp(uuid, integer) IS 
  'Awards XP points to a user and returns the new total. Only allows awarding XP to the authenticated user. Signature: award_xp(p_user_id uuid, p_amount integer)';

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.award_xp(uuid, integer) TO authenticated;

-- ============================================================
-- 5. VERIFY: Ensure only one function exists
-- ============================================================

DO $$
DECLARE
  func_count integer;
BEGIN
  SELECT COUNT(*) INTO func_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'award_xp';
  
  IF func_count != 1 THEN
    RAISE EXCEPTION 'Expected exactly 1 award_xp function, found %', func_count;
  END IF;
  
  RAISE NOTICE 'Success: Exactly 1 award_xp function exists';
END $$;

-- ============================================================
-- 6. NOTIFY POSTGREST TO RELOAD SCHEMA
-- ============================================================

NOTIFY pgrst, 'reload schema';

