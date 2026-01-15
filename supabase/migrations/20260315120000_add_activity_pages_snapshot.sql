-- Add snapshot fields to activities to store page progression at session time
ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS start_page integer,
  ADD COLUMN IF NOT EXISTS end_page integer,
  ADD COLUMN IF NOT EXISTS total_pages integer;

-- Optional check to avoid negative values
ALTER TABLE activities
  ADD CONSTRAINT IF NOT EXISTS chk_activities_pages_nonneg
  CHECK (
    (start_page IS NULL OR start_page >= 0) AND
    (end_page IS NULL OR end_page >= 0) AND
    (total_pages IS NULL OR total_pages >= 0)
  );

