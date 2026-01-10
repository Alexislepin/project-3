-- Requête SQL pour lister les 200 livres les plus problématiques
-- Critères:
-- - title is null OR title in ('Untitled','(OpenLibrary book)','Livre')
-- - OR author is null OR author in ('Auteur inconnu','')
-- - OR cover_url is null AND openlibrary_cover_id is null
-- - OR total_pages is null
-- - OR description is null OR length(description) < 80

SELECT 
  id,
  title,
  author,
  isbn,
  google_books_id,
  openlibrary_work_key,
  openlibrary_edition_key,
  cover_url,
  openlibrary_cover_id,
  total_pages,
  length(description) as desc_len,
  created_at as updated_at
FROM books
WHERE 
  -- Titre problématique
  (title IS NULL 
   OR title IN ('Untitled', '(OpenLibrary book)', 'Livre'))
  -- OU auteur problématique
  OR (author IS NULL 
      OR author IN ('Auteur inconnu', ''))
  -- OU pas de couverture
  OR (cover_url IS NULL 
      AND openlibrary_cover_id IS NULL)
  -- OU pas de nombre de pages
  OR total_pages IS NULL
  -- OU description manquante ou trop courte
  OR (description IS NULL 
      OR length(description) < 80)
ORDER BY created_at DESC
LIMIT 200;

