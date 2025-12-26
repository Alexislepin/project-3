/*
  # Update Books with Real ISBN and Covers

  1. Changes
    - Updates existing books with real ISBN numbers
    - Updates cover URLs to use Open Library API for real book covers
    - Uses ISBN-based cover URLs for authentic book covers
  
  2. Notes
    - Open Library API format: https://covers.openlibrary.org/b/isbn/{isbn}-L.jpg
    - All books updated with verified ISBN numbers
*/

-- Update French Classics
UPDATE books SET 
  isbn = '9782070413119',
  cover_url = 'https://covers.openlibrary.org/b/isbn/9782070413119-L.jpg'
WHERE title = 'Le Père Goriot' AND author = 'Honoré de Balzac';

UPDATE books SET 
  isbn = '9782253096337',
  cover_url = 'https://covers.openlibrary.org/b/isbn/9782253096337-L.jpg'
WHERE title = 'Les Misérables' AND author = 'Victor Hugo';

UPDATE books SET 
  isbn = '9782070360024',
  cover_url = 'https://covers.openlibrary.org/b/isbn/9782070360024-L.jpg'
WHERE title = 'L''Étranger' AND author = 'Albert Camus';

UPDATE books SET 
  isbn = '9782070612758',
  cover_url = 'https://covers.openlibrary.org/b/isbn/9782070612758-L.jpg'
WHERE title = 'Le Petit Prince' AND author = 'Antoine de Saint-Exupéry';

-- Update Self-Help & Personal Development
UPDATE books SET 
  isbn = '9780735211292',
  cover_url = 'https://covers.openlibrary.org/b/isbn/9780735211292-L.jpg'
WHERE title = 'Atomic Habits' AND author = 'James Clear';

UPDATE books SET 
  isbn = '9780140280197',
  cover_url = 'https://covers.openlibrary.org/b/isbn/9780140280197-L.jpg'
WHERE title = 'The 48 Laws of Power' AND author = 'Robert Greene';

-- Update Non-Fiction
UPDATE books SET 
  isbn = '9780062316110',
  cover_url = 'https://covers.openlibrary.org/b/isbn/9780062316110-L.jpg'
WHERE title = 'Sapiens' AND author = 'Yuval Noah Harari';

-- Update Popular Fiction
UPDATE books SET 
  isbn = '9781786892737',
  cover_url = 'https://covers.openlibrary.org/b/isbn/9781786892737-L.jpg'
WHERE title = 'The Midnight Library' AND author = 'Matt Haig';

UPDATE books SET 
  isbn = '9780593135204',
  cover_url = 'https://covers.openlibrary.org/b/isbn/9780593135204-L.jpg'
WHERE title = 'Project Hail Mary' AND author = 'Andy Weir';

UPDATE books SET 
  isbn = '9780441172719',
  cover_url = 'https://covers.openlibrary.org/b/isbn/9780441172719-L.jpg'
WHERE title = 'Dune' AND author = 'Frank Herbert';

-- Update Classics
UPDATE books SET 
  isbn = '9780452284234',
  cover_url = 'https://covers.openlibrary.org/b/isbn/9780452284234-L.jpg'
WHERE title = '1984' AND author = 'George Orwell';

UPDATE books SET 
  isbn = '9780743273565',
  cover_url = 'https://covers.openlibrary.org/b/isbn/9780743273565-L.jpg'
WHERE title = 'The Great Gatsby' AND author = 'F. Scott Fitzgerald';

UPDATE books SET 
  isbn = '9782070413935',
  cover_url = 'https://covers.openlibrary.org/b/isbn/9782070413935-L.jpg'
WHERE title = 'Madame Bovary' AND author = 'Gustave Flaubert';

UPDATE books SET 
  isbn = '9782070360420',
  cover_url = 'https://covers.openlibrary.org/b/isbn/9782070360420-L.jpg'
WHERE title = 'La Peste' AND author = 'Albert Camus';

UPDATE books SET 
  isbn = '9781250301697',
  cover_url = 'https://covers.openlibrary.org/b/isbn/9781250301697-L.jpg'
WHERE title = 'The Silent Patient' AND author = 'Alex Michaelides';