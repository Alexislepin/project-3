-- ============================================================================
-- Migration OPTIONNELLE : Convertir activities.book_id de TEXT à UUID
-- ============================================================================
-- Ce script convertit la colonne book_id de activities de TEXT à UUID,
-- si elle n'est pas déjà en UUID.
-- 
-- Note: Selon le schéma, activities.book_id est déjà UUID nullable,
-- mais ce script gère le cas où il serait en TEXT.
-- ============================================================================

BEGIN;

-- 1. Vérifier le type actuel de book_id
DO $$
DECLARE
  current_type TEXT;
BEGIN
  SELECT data_type INTO current_type
  FROM information_schema.columns
  WHERE table_name = 'activities' AND column_name = 'book_id';
  
  IF current_type IS NULL THEN
    RAISE EXCEPTION 'La colonne book_id n''existe pas dans activities';
  END IF;
  
  RAISE NOTICE 'Type actuel de activities.book_id: %', current_type;
END $$;

-- 2. Supprimer les contraintes existantes sur book_id (si elles existent)
ALTER TABLE activities
  DROP CONSTRAINT IF EXISTS activities_book_id_fkey;

-- 3. Supprimer les activités avec des book_id invalides (non-UUID ou UUID qui n'existent pas dans books)
-- On compare en texte pour éviter les erreurs de cast
DELETE FROM activities
WHERE book_id IS NOT NULL
  AND (
    -- book_id ne correspond pas au format UUID (regex sur texte)
    book_id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR
    -- book_id est un UUID valide mais n'existe pas dans books (comparaison textuelle)
    NOT EXISTS (
      SELECT 1 FROM books 
      WHERE id::text = activities.book_id::text
    )
  );

-- 4. Convertir book_id de TEXT à UUID (si nécessaire)
DO $$
BEGIN
  -- Vérifier si la colonne est déjà UUID
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'activities' 
      AND column_name = 'book_id'
      AND data_type = 'uuid'
  ) THEN
    RAISE NOTICE 'book_id est déjà de type UUID, pas de conversion nécessaire';
  ELSE
    -- Convertir TEXT vers UUID
    ALTER TABLE activities
      ALTER COLUMN book_id TYPE uuid USING book_id::uuid;
    
    RAISE NOTICE 'book_id converti de TEXT à UUID';
  END IF;
END $$;

-- 5. S'assurer que book_id est nullable (selon le schéma)
ALTER TABLE activities
  ALTER COLUMN book_id DROP NOT NULL;

-- 6. Ajouter/recréer la foreign key vers books(id) avec ON DELETE SET NULL
-- (selon le schéma, activities.book_id utilise ON DELETE SET NULL, pas CASCADE)
ALTER TABLE activities
  ADD CONSTRAINT activities_book_id_fkey 
  FOREIGN KEY (book_id) 
  REFERENCES books(id) 
  ON DELETE SET NULL;

COMMIT;

-- ============================================================================
-- Résumé : 
-- - activities.book_id est maintenant de type UUID (si ce n'était pas déjà le cas)
-- - Foreign key ajoutée/recréée vers books(id) avec ON DELETE SET NULL
-- - Les activités avec des book_id invalides ont été supprimées
-- ============================================================================

