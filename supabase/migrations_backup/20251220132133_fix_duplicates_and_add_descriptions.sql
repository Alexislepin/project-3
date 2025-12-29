/*
  # Fix Duplicate Books and Add Descriptions

  1. Changes
    - Remove duplicate book entries (keeps only one entry per title)
    - Add description column to books table for book summaries
    - Update books with French summaries
  
  2. Security
    - No RLS changes needed (existing policies still apply)
*/

-- First, remove duplicates by keeping only the book with the smallest ID for each title
DELETE FROM books a USING books b
WHERE a.id > b.id 
AND a.title = b.title 
AND a.author = b.author;

-- Add description column for book summaries
ALTER TABLE books ADD COLUMN IF NOT EXISTS description text;

-- Update books with French descriptions
UPDATE books SET description = 'Roman emblématique de Balzac, Le Père Goriot raconte l''histoire tragique d''un père aimant sacrifiant tout pour ses filles ingrates. Une critique acerbe de la société parisienne du XIXe siècle et des relations familiales.'
WHERE title = 'Le Père Goriot' AND author = 'Honoré de Balzac';

UPDATE books SET description = 'Chef-d''œuvre monumental de Victor Hugo, ce roman épique suit Jean Valjean, ancien bagnard en quête de rédemption dans la France du XIXe siècle. Une fresque historique puissante sur la justice, l''amour et la dignité humaine.'
WHERE title = 'Les Misérables' AND author = 'Victor Hugo';

UPDATE books SET description = 'Roman philosophique d''Albert Camus explorant l''absurdité de l''existence à travers Meursault, un homme indifférent qui commet un meurtre sans raison apparente. Une œuvre essentielle de la littérature existentialiste.'
WHERE title = 'L''Étranger' AND author = 'Albert Camus';

UPDATE books SET description = 'Conte poétique et philosophique où un petit prince voyage de planète en planète, rencontrant des adultes étranges. Une méditation intemporelle sur l''amitié, l''amour et le sens de la vie, racontée avec une simplicité touchante.'
WHERE title = 'Le Petit Prince' AND author = 'Antoine de Saint-Exupéry';

UPDATE books SET description = 'Guide pratique révolutionnaire qui démontre comment de petits changements quotidiens peuvent transformer radicalement votre vie. James Clear décortique la science des habitudes pour vous aider à construire de bonnes routines et éliminer les mauvaises.'
WHERE title = 'Atomic Habits' AND author = 'James Clear';

UPDATE books SET description = 'Manuel stratégique basé sur l''histoire et la philosophie, explorant les dynamiques du pouvoir à travers 48 lois illustrées par des exemples historiques. Un guide controversé mais fascinant sur l''influence et la manipulation.'
WHERE title = 'The 48 Laws of Power' AND author = 'Robert Greene';

UPDATE books SET description = 'Histoire fascinante de l''humanité depuis l''âge de pierre jusqu''à nos jours. Yuval Noah Harari explore comment Homo sapiens a dominé le monde grâce aux mythes, à la coopération et aux révolutions cognitives, agricoles et scientifiques.'
WHERE title = 'Sapiens' AND author = 'Yuval Noah Harari';

UPDATE books SET description = 'Roman poignant où Nora découvre une bibliothèque mystique contenant toutes les vies qu''elle aurait pu vivre. Une réflexion profonde sur les regrets, les choix et la recherche du bonheur dans un monde de possibilités infinies.'
WHERE title = 'The Midnight Library' AND author = 'Matt Haig';

UPDATE books SET description = 'Aventure spatiale épique où un astronaute solitaire doit sauver l''humanité d''une extinction imminente. Mélange parfait de science rigoureuse, d''humour et de suspense haletant signé par l''auteur de "Seul sur Mars".'
WHERE title = 'Project Hail Mary' AND author = 'Andy Weir';

UPDATE books SET description = 'Chef-d''œuvre de science-fiction se déroulant sur la planète désertique Arrakis, où les grandes maisons nobles se disputent le contrôle de l''épice, substance la plus précieuse de l''univers. Politique, écologie et mysticisme s''entremêlent dans cette saga épique.'
WHERE title = 'Dune' AND author = 'Frank Herbert';

UPDATE books SET description = 'Dystopie terrifiante où Big Brother surveille chaque aspect de la vie des citoyens. Orwell dépeint un régime totalitaire manipulant la vérité, le langage et la pensée elle-même. Une mise en garde glaçante contre les dangers de l''autoritarisme.'
WHERE title = '1984' AND author = 'George Orwell';

UPDATE books SET description = 'Tragédie américaine narrant l''ascension et la chute de Jay Gatsby, millionnaire mystérieux obsédé par son amour perdu. Fitzgerald capture brillamment les excès des Années folles et la désillusion du rêve américain.'
WHERE title = 'The Great Gatsby' AND author = 'F. Scott Fitzgerald';

UPDATE books SET description = 'Portrait implacable d''Emma Bovary, femme de province insatisfaite qui cherche l''évasion dans les liaisons adultères et le luxe. Flaubert dépeint avec réalisme les illusions romantiques et leurs conséquences tragiques.'
WHERE title = 'Madame Bovary' AND author = 'Gustave Flaubert';

UPDATE books SET description = 'Chronique d''une épidémie de peste dans la ville d''Oran, ce roman est une allégorie puissante sur la condition humaine face à l''absurde. Camus explore la solidarité, la révolte et la dignité dans un monde frappé par le mal.'
WHERE title = 'La Peste' AND author = 'Albert Camus';

UPDATE books SET description = 'Thriller psychologique captivant où une psychothérapeute est retrouvée morte et son patient, peintre célèbre, refuse de parler. Theo Faber, psychothérapeute criminel, est déterminé à percer le silence d''Alicia et découvrir la vérité.'
WHERE title = 'The Silent Patient' AND author = 'Alex Michaelides';