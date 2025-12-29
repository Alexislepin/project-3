/*
  # Add Multiple Editions Examples

  1. Changes
    - Add different editions of popular books with different page counts
    - Demonstrates how users can choose the specific edition they own
  
  2. Examples Added
    - Le Père Goriot: Pléiade edition (larger, more pages)
    - 1984: Different publishers with different page counts
    - The Great Gatsby: Various editions
*/

-- Add Pléiade edition of Le Père Goriot (longer version)
INSERT INTO books (title, author, total_pages, genre, cover_url, isbn, edition, publisher, description) VALUES
('Le Père Goriot', 'Honoré de Balzac', 485, 'Classique', 'https://covers.openlibrary.org/b/isbn/9782070108664-L.jpg', '9782070108664', 'Pléiade', 'Gallimard', 'Roman emblématique de Balzac, Le Père Goriot raconte l''histoire tragique d''un père aimant sacrifiant tout pour ses filles ingrates. Une critique acerbe de la société parisienne du XIXe siècle et des relations familiales.')
ON CONFLICT DO NOTHING;

-- Add Penguin Classics edition of 1984
INSERT INTO books (title, author, total_pages, genre, cover_url, isbn, edition, publisher, description) VALUES
('1984', 'George Orwell', 368, 'Dystopie', 'https://covers.openlibrary.org/b/isbn/9780141036144-L.jpg', '9780141036144', 'Penguin Classics', 'Penguin Books', 'Dystopie terrifiante où Big Brother surveille chaque aspect de la vie des citoyens. Orwell dépeint un régime totalitaire manipulant la vérité, le langage et la pensée elle-même. Une mise en garde glaçante contre les dangers de l''autoritarisme.')
ON CONFLICT DO NOTHING;

-- Add Scribner edition of The Great Gatsby  
INSERT INTO books (title, author, total_pages, genre, cover_url, isbn, edition, publisher, description) VALUES
('The Great Gatsby', 'F. Scott Fitzgerald', 180, 'Classique', 'https://covers.openlibrary.org/b/isbn/9780743273565-L.jpg', '9780684830421', 'Scribner Classics', 'Scribner', 'Tragédie américaine narrant l''ascension et la chute de Jay Gatsby, millionnaire mystérieux obsédé par son amour perdu. Fitzgerald capture brillamment les excès des Années folles et la désillusion du rêve américain.')
ON CONFLICT DO NOTHING;

-- Add pocket edition of Les Misérables (abridged version)
INSERT INTO books (title, author, total_pages, genre, cover_url, isbn, edition, publisher, description) VALUES
('Les Misérables', 'Victor Hugo', 512, 'Classique', 'https://covers.openlibrary.org/b/isbn/9782253160694-L.jpg', '9782253160694', 'Livre de Poche (Abrégé)', 'Hachette', 'Chef-d''œuvre monumental de Victor Hugo, ce roman épique suit Jean Valjean, ancien bagnard en quête de rédemption dans la France du XIXe siècle. Une fresque historique puissante sur la justice, l''amour et la dignité humaine. Version abrégée.')
ON CONFLICT DO NOTHING;

-- Add complete edition of Les Misérables
INSERT INTO books (title, author, total_pages, genre, cover_url, isbn, edition, publisher, description) VALUES
('Les Misérables', 'Victor Hugo', 1488, 'Classique', 'https://covers.openlibrary.org/b/isbn/9782253096337-L.jpg', '9782253096337', 'Intégrale', 'Livre de Poche', 'Chef-d''œuvre monumental de Victor Hugo, ce roman épique suit Jean Valjean, ancien bagnard en quête de rédemption dans la France du XIXe siècle. Une fresque historique puissante sur la justice, l''amour et la dignité humaine. Version complète intégrale.')
ON CONFLICT DO NOTHING;