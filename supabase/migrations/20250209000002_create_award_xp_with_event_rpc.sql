/*
  # Create RPC function to award XP with event logging
  
  Awards XP points and creates an event in xp_events table.
  
  1. Function: award_xp_with_event
    - Updates user_profiles.xp_total
    - Inserts into xp_events with all context
    - Returns new xp_total
  
  2. Security
    - SECURITY DEFINER (runs with creator privileges)
    - Checks that user_id matches auth.uid()
    - Atomic operation
*/

CREATE OR REPLACE FUNCTION public.award_xp_with_event(
  p_user_id uuid,
  p_amount integer,
  p_source text,
  p_verdict text,
  p_book_id text DEFAULT NULL,
  p_book_title text DEFAULT NULL,
  p_message text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_xp_total integer;
  v_verdict_valid text;
BEGIN
  -- Security check: only allow awarding XP to the authenticated user
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Cannot award XP to other users';
  END IF;

  -- Validate verdict
  IF p_verdict NOT IN ('correct', 'partial', 'incorrect') THEN
    RAISE EXCEPTION 'Invalid verdict: must be correct, partial, or incorrect';
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

  -- Insert XP event (bypassing RLS because we're SECURITY DEFINER)
  INSERT INTO public.xp_events (
    user_id,
    created_at,
    source,
    book_id,
    book_title,
    verdict,
    xp_amount,
    message
  ) VALUES (
    p_user_id,
    now(),
    p_source,
    p_book_id,
    p_book_title,
    p_verdict,
    p_amount,
    p_message
  );

  RETURN v_new_xp_total;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.award_xp_with_event(uuid, integer, text, text, text, text, text) TO authenticated;

COMMENT ON FUNCTION public.award_xp_with_event IS 'Awards XP points to a user, logs the event in xp_events with full context, and returns the new total. Only allows awarding XP to the authenticated user.';

