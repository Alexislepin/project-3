/*
  # Add Edition Field to Books Table

  1. Changes
    - Add edition field to books table to differentiate between different versions of the same book
    - Add publisher field to provide more context
    - Remove unique constraint on title+author to allow multiple editions
    - Update existing books with edition info where applicable
  
  2. Notes
    - Different editions can have different page counts
    - Users can now choose the specific edition they own
*/

-- Add edition and publisher fields
ALTER TABLE books ADD COLUMN IF NOT EXISTS edition text;
ALTER TABLE books ADD COLUMN IF NOT EXISTS publisher text;

-- Update some popular books with edition info
UPDATE books SET edition = 'Livre de Poche', publisher = 'Gallimard' WHERE title = 'Le Père Goriot' AND author = 'Honoré de Balzac';
UPDATE books SET edition = 'Folio', publisher = 'Gallimard' WHERE title = 'L''Étranger' AND author = 'Albert Camus';
UPDATE books SET edition = 'Folio', publisher = 'Gallimard' WHERE title = 'La Peste' AND author = 'Albert Camus';
UPDATE books SET edition = 'Livre de Poche', publisher = 'Hachette' WHERE title = 'Les Misérables' AND author = 'Victor Hugo';
UPDATE books SET edition = 'Folio', publisher = 'Gallimard' WHERE title = 'Le Petit Prince' AND author = 'Antoine de Saint-Exupéry';
UPDATE books SET edition = 'Folio', publisher = 'Gallimard' WHERE title = 'Madame Bovary' AND author = 'Gustave Flaubert';

-- Set default edition for books without one
UPDATE books SET edition = 'Standard Edition' WHERE edition IS NULL;