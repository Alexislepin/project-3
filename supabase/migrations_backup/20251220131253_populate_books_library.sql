/*
  # Populate Books Library

  1. Changes
    - Adds a curated collection of popular books to the books table
    - Includes French classics, international bestsellers, and popular fiction
    - Each book includes title, author, total pages, genre, and cover URL from Pexels
  
  2. Books Added
    - French Classics: Le Père Goriot, Les Misérables, L'Étranger, Le Petit Prince
    - International Bestsellers: Atomic Habits, The 48 Laws of Power, Sapiens
    - Popular Fiction: The Midnight Library, Project Hail Mary, Dune
    - Self-Help: Think and Grow Rich, The Subtle Art of Not Giving a F*ck
    
  3. Notes
    - Cover URLs use stock images from Pexels
    - All books are available for users to add to their personal libraries
    - Uses conditional insert to avoid duplicates
*/

-- Insert popular books only if they don't already exist
DO $$ 
BEGIN
  -- French Classics
  IF NOT EXISTS (SELECT 1 FROM books WHERE title = 'Le Père Goriot' AND author = 'Honoré de Balzac') THEN
    INSERT INTO books (title, author, total_pages, genre, cover_url) 
    VALUES ('Le Père Goriot', 'Honoré de Balzac', 312, 'Classique', 'https://images.pexels.com/photos/1907785/pexels-photo-1907785.jpeg');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM books WHERE title = 'Les Misérables' AND author = 'Victor Hugo') THEN
    INSERT INTO books (title, author, total_pages, genre, cover_url) 
    VALUES ('Les Misérables', 'Victor Hugo', 1463, 'Classique', 'https://images.pexels.com/photos/667838/pexels-photo-667838.jpeg');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM books WHERE title = 'L''Étranger' AND author = 'Albert Camus') THEN
    INSERT INTO books (title, author, total_pages, genre, cover_url) 
    VALUES ('L''Étranger', 'Albert Camus', 123, 'Classique', 'https://images.pexels.com/photos/2177009/pexels-photo-2177009.jpeg');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM books WHERE title = 'Le Petit Prince' AND author = 'Antoine de Saint-Exupéry') THEN
    INSERT INTO books (title, author, total_pages, genre, cover_url) 
    VALUES ('Le Petit Prince', 'Antoine de Saint-Exupéry', 96, 'Classique', 'https://images.pexels.com/photos/2228561/pexels-photo-2228561.jpeg');
  END IF;
  
  -- Self-Help & Personal Development
  IF NOT EXISTS (SELECT 1 FROM books WHERE title = 'Atomic Habits' AND author = 'James Clear') THEN
    INSERT INTO books (title, author, total_pages, genre, cover_url) 
    VALUES ('Atomic Habits', 'James Clear', 320, 'Développement Personnel', 'https://images.pexels.com/photos/590016/pexels-photo-590016.jpeg');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM books WHERE title = 'The 48 Laws of Power' AND author = 'Robert Greene') THEN
    INSERT INTO books (title, author, total_pages, genre, cover_url) 
    VALUES ('The 48 Laws of Power', 'Robert Greene', 452, 'Développement Personnel', 'https://images.pexels.com/photos/2882509/pexels-photo-2882509.jpeg');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM books WHERE title = 'Sapiens' AND author = 'Yuval Noah Harari') THEN
    INSERT INTO books (title, author, total_pages, genre, cover_url) 
    VALUES ('Sapiens', 'Yuval Noah Harari', 443, 'Histoire', 'https://images.pexels.com/photos/1319854/pexels-photo-1319854.jpeg');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM books WHERE title = 'The Midnight Library' AND author = 'Matt Haig') THEN
    INSERT INTO books (title, author, total_pages, genre, cover_url) 
    VALUES ('The Midnight Library', 'Matt Haig', 304, 'Fiction', 'https://images.pexels.com/photos/2908984/pexels-photo-2908984.jpeg');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM books WHERE title = 'Project Hail Mary' AND author = 'Andy Weir') THEN
    INSERT INTO books (title, author, total_pages, genre, cover_url) 
    VALUES ('Project Hail Mary', 'Andy Weir', 476, 'Science-Fiction', 'https://images.pexels.com/photos/2159/flight-sky-earth-space.jpg');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM books WHERE title = 'Dune' AND author = 'Frank Herbert') THEN
    INSERT INTO books (title, author, total_pages, genre, cover_url) 
    VALUES ('Dune', 'Frank Herbert', 688, 'Science-Fiction', 'https://images.pexels.com/photos/1583582/pexels-photo-1583582.jpeg');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM books WHERE title = '1984' AND author = 'George Orwell') THEN
    INSERT INTO books (title, author, total_pages, genre, cover_url) 
    VALUES ('1984', 'George Orwell', 328, 'Classique', 'https://images.pexels.com/photos/1242348/pexels-photo-1242348.jpeg');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM books WHERE title = 'The Great Gatsby' AND author = 'F. Scott Fitzgerald') THEN
    INSERT INTO books (title, author, total_pages, genre, cover_url) 
    VALUES ('The Great Gatsby', 'F. Scott Fitzgerald', 180, 'Classique', 'https://images.pexels.com/photos/1329711/pexels-photo-1329711.jpeg');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM books WHERE title = 'Madame Bovary' AND author = 'Gustave Flaubert') THEN
    INSERT INTO books (title, author, total_pages, genre, cover_url) 
    VALUES ('Madame Bovary', 'Gustave Flaubert', 340, 'Classique', 'https://images.pexels.com/photos/3184418/pexels-photo-3184418.jpeg');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM books WHERE title = 'La Peste' AND author = 'Albert Camus') THEN
    INSERT INTO books (title, author, total_pages, genre, cover_url) 
    VALUES ('La Peste', 'Albert Camus', 308, 'Classique', 'https://images.pexels.com/photos/1907785/pexels-photo-1907785.jpeg');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM books WHERE title = 'The Silent Patient' AND author = 'Alex Michaelides') THEN
    INSERT INTO books (title, author, total_pages, genre, cover_url) 
    VALUES ('The Silent Patient', 'Alex Michaelides', 336, 'Thriller', 'https://images.pexels.com/photos/2228828/pexels-photo-2228828.jpeg');
  END IF;
END $$;