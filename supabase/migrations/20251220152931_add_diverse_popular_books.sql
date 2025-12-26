/*
  # Add diverse popular books

  This migration adds a variety of popular books to showcase in the "Livres populaires" section.
  
  1. New Books Added
    - Harry Potter à l'école des sorciers - J.K. Rowling
    - Le Petit Prince - Antoine de Saint-Exupéry
    - Les Misérables - Victor Hugo
    - Le Seigneur des Anneaux - J.R.R. Tolkien
    - Orgueil et Préjugés - Jane Austen
    - Ne tirez pas sur l'oiseau moqueur - Harper Lee
*/

INSERT INTO books (title, author, cover_url, total_pages, genre, description) VALUES
(
  'Harry Potter à l''école des sorciers',
  'J.K. Rowling',
  'https://images-na.ssl-images-amazon.com/images/S/compressed.photo.goodreads.com/books/1598823299i/54825378.jpg',
  320,
  'Fantasy',
  'Le jour de ses onze ans, Harry Potter, un orphelin élevé par un oncle et une tante qui le détestent, voit son existence bouleversée. Un géant vient le chercher pour l''emmener à Poudlard, une école de sorcellerie.'
),
(
  'Le Petit Prince',
  'Antoine de Saint-Exupéry',
  'https://images-na.ssl-images-amazon.com/images/S/compressed.photo.goodreads.com/books/1367545443i/157993.jpg',
  96,
  'Fiction',
  'Le Petit Prince est une œuvre de langue française, la plus connue d''Antoine de Saint-Exupéry. Publié en 1943, c''est un conte philosophique et poétique.'
),
(
  'Les Misérables',
  'Victor Hugo',
  'https://images-na.ssl-images-amazon.com/images/S/compressed.photo.goodreads.com/books/1411852091i/24280.jpg',
  1463,
  'Classique',
  'Dans la France du XIXe siècle, Jean Valjean, un ancien forçat, tente de se racheter malgré l''acharnement du policier Javert.'
),
(
  'Le Seigneur des Anneaux',
  'J.R.R. Tolkien',
  'https://images-na.ssl-images-amazon.com/images/S/compressed.photo.goodreads.com/books/1566425108i/33.jpg',
  1178,
  'Fantasy',
  'Une quête épique dans la Terre du Milieu pour détruire l''Anneau Unique et sauver le monde du Seigneur des Ténèbres Sauron.'
),
(
  'Orgueil et Préjugés',
  'Jane Austen',
  'https://images-na.ssl-images-amazon.com/images/S/compressed.photo.goodreads.com/books/1320399351i/1885.jpg',
  432,
  'Romance',
  'L''histoire d''Elizabeth Bennet et de Mr Darcy, deux personnages que tout oppose mais qui vont apprendre à se connaître et s''aimer.'
),
(
  'Ne tirez pas sur l''oiseau moqueur',
  'Harper Lee',
  'https://images-na.ssl-images-amazon.com/images/S/compressed.photo.goodreads.com/books/1553383690i/2657.jpg',
  384,
  'Fiction',
  'Dans l''Alabama des années 1930, Scout Finch grandit auprès de son père, avocat qui défend un homme noir accusé à tort.'
)
ON CONFLICT DO NOTHING;
