/*
  # Add OpenLibrary cover ID to books

  1. Changes
    - Add openlibrary_cover_id column to books to store the first cover ID from Open Library (covers[0])
    - Keep existing cover_url column for backward compatibility, but new code should prefer openlibrary_cover_id
*/

ALTER TABLE books
ADD COLUMN IF NOT EXISTS openlibrary_cover_id integer;


