-- ============================================================================
-- Script de nettoyage : Supprimer les faux livres et leurs dépendances
-- ============================================================================
-- Ce script supprime les livres avec des titres invalides (NULL, '', 'livre', 'book')
-- et toutes les données associées (likes, activités, user_books, etc.)
-- 
-- SÉCURITÉ : Utilise des transactions et des vérifications pour éviter les suppressions accidentelles
-- ============================================================================

BEGIN;

-- 1. Identifier les faux livres (title NULL, '', 'livre', 'book')
-- Note: On utilise LOWER(TRIM()) pour gérer les variations de casse et espaces
CREATE TEMP TABLE IF NOT EXISTS fake_books AS
SELECT id, title
FROM books
WHERE title IS NULL 
   OR TRIM(title) = ''
   OR LOWER(TRIM(title)) = 'livre'
   OR LOWER(TRIM(title)) = 'book';

-- Afficher le nombre de faux livres trouvés (pour vérification)
DO $$
DECLARE
  fake_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO fake_count FROM fake_books;
  RAISE NOTICE 'Nombre de faux livres identifiés: %', fake_count;
END $$;

-- 2. Supprimer les likes associés aux faux livres
-- Gère le cas où book_id est TEXT (cast vers UUID) ou UUID
-- On convertit tout en texte pour la comparaison (fonctionne pour les deux types)
DELETE FROM book_likes
WHERE book_id IS NOT NULL
  AND book_id::text IN (SELECT id::text FROM fake_books);

-- 3. Supprimer les commentaires associés aux faux livres
DELETE FROM book_comments
WHERE book_id IS NOT NULL
  AND book_id::text IN (SELECT id::text FROM fake_books);

-- 4. Supprimer les activités associées aux faux livres
DELETE FROM activities
WHERE book_id IN (SELECT id FROM fake_books);

-- 5. Supprimer les user_books associés aux faux livres (CASCADE devrait le faire, mais on le fait explicitement)
DELETE FROM user_books
WHERE book_id IN (SELECT id FROM fake_books);

-- 6. Supprimer les événements d'activité associés (via book_id UUID)
DELETE FROM activity_events
WHERE book_id IN (SELECT id FROM fake_books);

-- 7. Supprimer les faux livres eux-mêmes
DELETE FROM books
WHERE id IN (SELECT id FROM fake_books);

-- Nettoyer la table temporaire
DROP TABLE IF EXISTS fake_books;

COMMIT;

-- ============================================================================
-- Résumé : Ce script a supprimé tous les livres avec des titres invalides
-- et toutes leurs dépendances (likes, commentaires, activités, user_books, etc.)
-- ============================================================================

