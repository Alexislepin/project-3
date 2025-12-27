/*
  # Create RPC function to award XP points securely
  
  1. Changes
    - Create function award_xp that increments xp_total for a user
    - Returns the new xp_total value
    - Updates last_xp_at timestamp
  
  2. Security
    - Function is SECURITY DEFINER (runs with creator privileges)
    - Checks that user_id matches auth.uid() to prevent awarding XP to other users
    - Uses atomic update to prevent race conditions
*/

CREATE OR REPLACE FUNCTION public.award_xp(
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

COMMENT ON FUNCTION public.award_xp IS 'Awards XP points to a user and returns the new total. Only allows awarding XP to the authenticated user.';

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.award_xp TO authenticated;

