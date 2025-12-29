/*
  # Create XP Events Table
  
  Stores a complete history of XP awards with context (verdict, book, message).
  
  1. New Table: xp_events
    - id (uuid, primary key)
    - user_id (uuid, references user_profiles)
    - created_at (timestamptz)
    - source (text, e.g., 'challenge', 'activity', 'streak', etc.)
    - book_id (text, nullable - book identifier)
    - book_title (text, nullable - book title for display)
    - verdict (text, CHECK: 'correct', 'partial', 'incorrect')
    - xp_amount (integer, XP awarded)
    - message (text, human-readable message in FR)
    - meta (jsonb, nullable - additional metadata)
  
  2. Security
    - RLS enabled
    - Users can only see their own XP events
    - INSERT only via RPC (security definer)
  
  3. Index
    - (user_id, created_at DESC) for fast queries
*/

-- Create xp_events table
CREATE TABLE IF NOT EXISTS public.xp_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL,
  book_id text,
  book_title text,
  verdict text NOT NULL CHECK (verdict IN ('correct', 'partial', 'incorrect')),
  xp_amount integer NOT NULL,
  message text NOT NULL,
  meta jsonb
);

-- Index for fast queries
CREATE INDEX IF NOT EXISTS idx_xp_events_user_created ON public.xp_events(user_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.xp_events ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see their own XP events
DROP POLICY IF EXISTS "Users can view own xp_events" ON public.xp_events;
CREATE POLICY "Users can view own xp_events"
  ON public.xp_events FOR SELECT
  USING (auth.uid() = user_id);

-- RLS Policy: No direct INSERT from client (only via RPC)
-- We don't create an INSERT policy, forcing inserts to go through the security definer RPC

-- Grant necessary permissions
GRANT SELECT ON public.xp_events TO authenticated;

COMMENT ON TABLE public.xp_events IS 'Complete history of XP awards with context (verdict, book, message)';
COMMENT ON COLUMN public.xp_events.source IS 'Source of XP (e.g., challenge, activity, streak)';
COMMENT ON COLUMN public.xp_events.verdict IS 'Verdict for challenges: correct, partial, or incorrect';
COMMENT ON COLUMN public.xp_events.message IS 'Human-readable message in French ready to display';

