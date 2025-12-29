/*
  # Mise à jour des ISBN manquants

  1. Modifications
    - Ajoute les ISBN manquants pour les livres populaires de la base de données
    - Assure que les couvertures peuvent être chargées depuis Open Library en cas d'échec de Google Books
  
  2. Livres mis à jour
    - Deep Work (Cal Newport): 9781455586691
    - The Psychology of Money (Morgan Housel): 9780857197689
    - Educated (Tara Westover): 9780399590504
    - The Design of Everyday Things (Don Norman): 9780465050659
    - The Lean Startup (Eric Ries): 9780307887894
    - 1984 (George Orwell): 9780451524935
    - La chute (Albert Camus): 9782070360314
*/

UPDATE books 
SET isbn = '9781455586691' 
WHERE title = 'Deep Work' AND author = 'Cal Newport' AND (isbn IS NULL OR isbn = '');

UPDATE books 
SET isbn = '9780857197689' 
WHERE title = 'The Psychology of Money' AND author = 'Morgan Housel' AND (isbn IS NULL OR isbn = '');

UPDATE books 
SET isbn = '9780399590504' 
WHERE title = 'Educated' AND author = 'Tara Westover' AND (isbn IS NULL OR isbn = '');

UPDATE books 
SET isbn = '9780465050659' 
WHERE title = 'The Design of Everyday Things' AND author = 'Don Norman' AND (isbn IS NULL OR isbn = '');

UPDATE books 
SET isbn = '9780307887894' 
WHERE title = 'The Lean Startup' AND author = 'Eric Ries' AND (isbn IS NULL OR isbn = '');

UPDATE books 
SET isbn = '9780451524935' 
WHERE title = '1984' AND author = 'George Orwell' AND (isbn IS NULL OR isbn = '');

UPDATE books 
SET isbn = '9782070360314' 
WHERE title = 'La chute' AND author = 'Albert Camus' AND (isbn IS NULL OR isbn = '');
