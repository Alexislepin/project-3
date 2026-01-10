-- ============================================================================
-- Migration : Convertir book_likes.book_id de TEXT à UUID
-- ============================================================================
-- Ce script convertit la colonne book_id de book_likes de TEXT à UUID,
-- ajoute une foreign key vers books(id) avec ON DELETE CASCADE,
-- et crée un index pour les performances.
-- 
-- Gère les cas où book_id contient des valeurs non-UUID (les supprime)
-- ============================================================================

BEGIN;

-- 1. Vérifier le type actuel de book_id
DO $$
DECLARE
  current_type TEXT;
BEGIN
  SELECT data_type INTO current_type
  FROM information_schema.columns
  WHERE table_name = 'book_likes' AND column_name = 'book_id';
  
  IF current_type IS NULL THEN
    RAISE EXCEPTION 'La colonne book_id n''existe pas dans book_likes';
  END IF;
  
  RAISE NOTICE 'Type actuel de book_likes.book_id: %', current_type;
END $$;

-- 2. Supprimer les contraintes existantes sur book_id (si elles existent)
ALTER TABLE book_likes
  DROP CONSTRAINT IF EXISTS book_likes_book_id_fkey;

-- 3. Supprimer les likes avec des book_id invalides (non-UUID ou UUID qui n'existent pas dans books)
-- On supprime les lignes où book_id ne peut pas être converti en UUID valide
-- ou où le UUID n'existe pas dans la table books
-- On compare en texte pour éviter les erreurs de cast
DELETE FROM book_likes
WHERE book_id IS NOT NULL
  AND (
    -- book_id ne correspond pas au format UUID (regex sur texte)
    book_id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR
    -- book_id est un UUID valide mais n'existe pas dans books (comparaison textuelle)
    NOT EXISTS (
      SELECT 1 FROM books 
      WHERE id::text = book_likes.book_id::text
    )
  );

-- 4. Convertir book_id de TEXT à UUID
-- Si book_id est déjà UUID, cette opération est idempotente
-- Si book_id est TEXT, on le convertit en UUID
DO $$
BEGIN
  -- Vérifier si la colonne est déjà UUID
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'book_likes' 
      AND column_name = 'book_id'
      AND data_type = 'uuid'
  ) THEN
    RAISE NOTICE 'book_id est déjà de type UUID, pas de conversion nécessaire';
  ELSE
    -- Convertir TEXT vers UUID
    -- On utilise USING pour convertir les valeurs existantes
    ALTER TABLE book_likes
      ALTER COLUMN book_id TYPE uuid USING book_id::uuid;
    
    RAISE NOTICE 'book_id converti de TEXT à UUID';
  END IF;
END $$;

-- 5. Rendre book_id nullable (selon le schéma, il peut être NULL)
-- Cette opération est idempotente si déjà nullable
ALTER TABLE book_likes
  ALTER COLUMN book_id DROP NOT NULL;

-- 6. Ajouter la foreign key vers books(id) avec ON DELETE CASCADE
ALTER TABLE book_likes
  ADD CONSTRAINT book_likes_book_id_fkey 
  FOREIGN KEY (book_id) 
  REFERENCES books(id) 
  ON DELETE CASCADE;

-- 7. Créer/recréer l'index sur book_id pour les performances
DROP INDEX IF EXISTS idx_book_likes_book_id;
CREATE INDEX idx_book_likes_book_id ON book_likes(book_id);

COMMIT;

-- ============================================================================
-- Résumé : 
-- - book_likes.book_id est maintenant de type UUID
-- - Foreign key ajoutée vers books(id) avec ON DELETE CASCADE
-- - Index créé pour les performances
-- - Les likes avec des book_id invalides ont été supprimés
-- ============================================================================

