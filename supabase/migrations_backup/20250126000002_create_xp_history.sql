/*
  # Create XP History Table
  
  Stores a log of all XP awards for users to display in a feed/history view.
  
  1. New Table: xp_history
    - id (uuid, primary key)
    - user_id (uuid, references user_profiles)
    - amount (integer, XP awarded)
    - source (text, e.g., 'challenge', 'activity', 'streak', etc.)
    - source_id (uuid, optional, reference to the source entity)
    - description (text, optional, human-readable description)
    - xp_total_after (integer, total XP after this award)
    - created_at (timestamptz)
  
  2. Security
    - RLS enabled
    - Users can only see their own XP history
  
  3. Trigger
    - Automatically log XP awards when award_xp function is called
*/

-- Create xp_history table
CREATE TABLE IF NOT EXISTS public.xp_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  amount integer NOT NULL,
  source text NOT NULL DEFAULT 'unknown',
  source_id uuid,
  description text,
  xp_total_after integer NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Index for fast queries
CREATE INDEX IF NOT EXISTS idx_xp_history_user_id ON public.xp_history(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_xp_history_source ON public.xp_history(source, created_at DESC);

-- Enable RLS
ALTER TABLE public.xp_history ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see their own XP history
DROP POLICY IF EXISTS "Users can view own xp_history" ON public.xp_history;
CREATE POLICY "Users can view own xp_history"
  ON public.xp_history FOR SELECT
  USING (auth.uid() = user_id);

-- RLS Policy: Service role can insert (for triggers/functions)
DROP POLICY IF EXISTS "Service role can insert xp_history" ON public.xp_history;
CREATE POLICY "Service role can insert xp_history"
  ON public.xp_history FOR INSERT
  WITH CHECK (true);

-- Modify award_xp function to log history
CREATE OR REPLACE FUNCTION public.award_xp(
  p_user_id uuid,
  p_amount integer,
  p_source text DEFAULT 'unknown',
  p_source_id uuid DEFAULT NULL,
  p_description text DEFAULT NULL
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

  -- Log XP history
  INSERT INTO public.xp_history (
    user_id,
    amount,
    source,
    source_id,
    description,
    xp_total_after
  ) VALUES (
    p_user_id,
    p_amount,
    p_source,
    p_source_id,
    p_description,
    v_new_xp_total
  );

  RETURN v_new_xp_total;
END;
$$;

-- Update comment
COMMENT ON FUNCTION public.award_xp(uuid, integer, text, uuid, text) IS 
  'Awards XP points to a user, logs the event in xp_history, and returns the new total. Only allows awarding XP to the authenticated user.';

-- Notify PostgREST
NOTIFY pgrst, 'reload schema';

