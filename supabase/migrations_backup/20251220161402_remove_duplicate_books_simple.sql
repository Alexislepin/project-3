/*
  # Remove duplicate books from database

  1. Changes
    - Identifies and removes duplicate books based on title and author
    - Keeps only one instance of each unique book (the one with the lowest id)
    - Only removes duplicates that are not referenced by user_books
  
  2. Security
    - No security changes, just data cleanup
*/

-- Delete duplicate books that are NOT referenced by any user
DELETE FROM books
WHERE id IN (
  SELECT b1.id
  FROM books b1
  INNER JOIN books b2 ON 
    LOWER(b1.title) = LOWER(b2.title) 
    AND LOWER(b1.author) = LOWER(b2.author)
    AND b1.id > b2.id
  LEFT JOIN user_books ub ON ub.book_id = b1.id
  WHERE ub.id IS NULL
);