-- Add description_clean columns to books table
ALTER TABLE books
ADD COLUMN IF NOT EXISTS description_clean TEXT,
ADD COLUMN IF NOT EXISTS description_clean_updated_at TIMESTAMPTZ;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_books_description_clean_updated_at 
ON books(description_clean_updated_at) 
WHERE description_clean IS NOT NULL;

-- Add comment
COMMENT ON COLUMN books.description_clean IS 'Cleaned and translated description (2-3 sentences max, French)';
COMMENT ON COLUMN books.description_clean_updated_at IS 'Timestamp when description_clean was last updated';

