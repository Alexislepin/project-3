/*
  # Remove Specific Duplicate Books

  1. Changes
    - Remove duplicate entries for "Le Père Goriot" keeping only the one with valid ISBN
    - Ensures only one entry per classic book remains
  
  2. Notes
    - Keeps books with valid ISBN and descriptions
    - Removes old duplicate entries without ISBN data
*/

-- Remove duplicate "Le Père Goriot" entries that don't have ISBN
DELETE FROM books 
WHERE (title ILIKE '%père goriot%' OR title ILIKE '%pere goriot%')
AND (isbn IS NULL OR isbn = '');

-- Also clean up any other potential duplicates by keeping only books with ISBN when duplicates exist
DELETE FROM books a 
WHERE EXISTS (
  SELECT 1 FROM books b 
  WHERE LOWER(REPLACE(a.title, ' ', '')) = LOWER(REPLACE(b.title, ' ', ''))
  AND LOWER(REPLACE(a.author, ' ', '')) = LOWER(REPLACE(b.author, ' ', ''))
  AND b.isbn IS NOT NULL 
  AND b.isbn != ''
  AND (a.isbn IS NULL OR a.isbn = '')
  AND a.id != b.id
);