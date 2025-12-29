/*
  # Add Reading State Constraints to user_books
  
  1. Changes
    - Add CHECK constraints to ensure data integrity for reading state
    - Ensure current_page is valid (>= 0)
    - Ensure current_page <= total_pages when both are set
    - Note: total_pages comes from books.total_pages or custom_total_pages
    - Add helpful comments
  
  2. Notes
    - We validate in the app, but database constraints provide additional safety
    - current_page can be NULL or 0 for "want_to_read" status
    - For "reading" status, current_page should be >= 1
    - For "completed" status, current_page should equal total_pages
*/

-- Add constraint to ensure current_page is non-negative
ALTER TABLE user_books 
DROP CONSTRAINT IF EXISTS user_books_current_page_check;

ALTER TABLE user_books 
ADD CONSTRAINT user_books_current_page_check 
CHECK (current_page IS NULL OR current_page >= 0);

-- Note: We can't directly check current_page <= total_pages in user_books
-- because total_pages is in books.total_pages or custom_total_pages
-- We'll enforce this in application logic
-- But we can add a constraint for custom_total_pages if it exists

ALTER TABLE user_books
DROP CONSTRAINT IF EXISTS user_books_custom_total_pages_check;

ALTER TABLE user_books
ADD CONSTRAINT user_books_custom_total_pages_check
CHECK (custom_total_pages IS NULL OR custom_total_pages >= 1);

-- Add helpful comments
COMMENT ON CONSTRAINT user_books_current_page_check ON user_books IS 'Ensure current_page is non-negative (0 means not started)';
COMMENT ON CONSTRAINT user_books_custom_total_pages_check ON user_books IS 'Ensure custom_total_pages is at least 1 if set';

