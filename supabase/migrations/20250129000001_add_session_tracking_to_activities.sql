/*
  # Add Session Tracking to Activities Table
  
  1. Changes
    - Add `started_at` column to track when session started
    - Add `ended_at` column to track when session ended (NULL = active session)
    - Add index on `ended_at` for efficient queries of active sessions
  
  2. Purpose
    - Enable persistent reading sessions that survive app backgrounding
    - Active session = `ended_at IS NULL` AND `visibility = 'private'`
    - Completed session = `ended_at IS NOT NULL`
  
  3. Security
    - Maintains existing RLS policies
    - Users can only manage their own activities
*/

-- Add started_at column (when the session started)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'activities' AND column_name = 'started_at'
  ) THEN
    ALTER TABLE public.activities 
    ADD COLUMN started_at timestamptz DEFAULT now();
  END IF;
END $$;

-- Add ended_at column (NULL = active session, NOT NULL = completed)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'activities' AND column_name = 'ended_at'
  ) THEN
    ALTER TABLE public.activities 
    ADD COLUMN ended_at timestamptz;
  END IF;
END $$;

-- Add paused_total_seconds column (cumulative paused time)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'activities' AND column_name = 'paused_total_seconds'
  ) THEN
    ALTER TABLE public.activities 
    ADD COLUMN paused_total_seconds integer DEFAULT 0;
  END IF;
END $$;

-- Add last_pause_at column (when pause started, NULL = not paused)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'activities' AND column_name = 'last_pause_at'
  ) THEN
    ALTER TABLE public.activities 
    ADD COLUMN last_pause_at timestamptz;
  END IF;
END $$;

-- Add index for efficient queries of active sessions
CREATE INDEX IF NOT EXISTS idx_activities_active_sessions 
ON public.activities(user_id, ended_at) 
WHERE ended_at IS NULL AND visibility = 'private';

-- Add index for efficient queries of completed sessions
CREATE INDEX IF NOT EXISTS idx_activities_ended_at 
ON public.activities(ended_at DESC) 
WHERE ended_at IS NOT NULL;

-- Update existing activities: set started_at = created_at if NULL
UPDATE public.activities 
SET started_at = created_at 
WHERE started_at IS NULL;

COMMENT ON COLUMN public.activities.started_at IS 'When the session/activity started. For active sessions, this is when the timer started.';
COMMENT ON COLUMN public.activities.ended_at IS 'When the session/activity ended. NULL = active session, NOT NULL = completed session.';
COMMENT ON COLUMN public.activities.paused_total_seconds IS 'Cumulative seconds spent in paused state.';
COMMENT ON COLUMN public.activities.last_pause_at IS 'When the session was last paused. NULL = currently running, NOT NULL = currently paused.';

