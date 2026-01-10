# Migration : Correction de book_id TEXT → UUID

## Problème

- `books.id` est en UUID
- `book_likes.book_id` est en TEXT (devrait être UUID)
- Cela cause des erreurs : `operator does not exist: text = uuid`
- Des likes existent sur de faux livres (title NULL, '', 'livre', 'book')

## Solution

Trois scripts SQL ont été créés pour résoudre ce problème :

### 1. Nettoyage des faux livres
**Fichier :** `supabase/migrations/20250131_cleanup_fake_books.sql`

**Action :**
- Identifie les livres avec des titres invalides (NULL, '', 'livre', 'book')
- Supprime tous les likes, commentaires, activités, user_books associés
- Supprime les faux livres eux-mêmes

**À exécuter en premier** pour nettoyer les données avant la migration.

### 2. Migration book_likes.book_id
**Fichier :** `supabase/migrations/20250131_fix_book_likes_book_id_uuid.sql`

**Action :**
- Supprime les likes avec des `book_id` invalides (non-UUID ou UUID inexistants)
- Convertit `book_likes.book_id` de TEXT à UUID
- Ajoute une foreign key vers `books(id)` avec `ON DELETE CASCADE`
- Crée un index sur `book_id` pour les performances

### 3. Migration activities.book_id (optionnel)
**Fichier :** `supabase/migrations/20250131_fix_activities_book_id_uuid.sql`

**Action :**
- Même traitement que pour `book_likes` mais pour `activities.book_id`
- Utilise `ON DELETE SET NULL` (pas CASCADE) selon le schéma
- À exécuter seulement si `activities.book_id` est aussi en TEXT

## Ordre d'exécution

1. **D'abord :** `20250131_cleanup_fake_books.sql`
2. **Ensuite :** `20250131_fix_book_likes_book_id_uuid.sql`
3. **Optionnel :** `20250131_fix_activities_book_id_uuid.sql` (si nécessaire)

## Exécution

### Via Supabase Dashboard

1. Ouvrir Supabase Dashboard → SQL Editor
2. Copier-coller chaque script dans l'ordre
3. Exécuter chaque script séparément
4. Vérifier les messages NOTICE pour confirmer les actions

### Via CLI Supabase

```bash
# Depuis le répertoire du projet
supabase db push
```

## Vérification

Après exécution, vérifier que :

1. `book_likes.book_id` est de type UUID :
```sql
SELECT data_type 
FROM information_schema.columns 
WHERE table_name = 'book_likes' AND column_name = 'book_id';
-- Doit retourner 'uuid'
```

2. La foreign key existe :
```sql
SELECT constraint_name 
FROM information_schema.table_constraints 
WHERE table_name = 'book_likes' 
  AND constraint_type = 'FOREIGN KEY';
-- Doit retourner 'book_likes_book_id_fkey'
```

3. Plus de livres avec titres invalides :
```sql
SELECT COUNT(*) 
FROM books 
WHERE title IS NULL 
   OR TRIM(title) = '' 
   OR LOWER(TRIM(title)) IN ('livre', 'book');
-- Doit retourner 0
```

## Notes de sécurité

- Tous les scripts utilisent des transactions (`BEGIN`/`COMMIT`)
- Les scripts sont idempotents (peuvent être exécutés plusieurs fois)
- Les données invalides sont supprimées (pas de conversion forcée)
- Les foreign keys garantissent l'intégrité référentielle

## Rollback

Si besoin de revenir en arrière (non recommandé) :

```sql
-- Retirer la foreign key
ALTER TABLE book_likes DROP CONSTRAINT IF EXISTS book_likes_book_id_fkey;

-- Reconvertir en TEXT (perd les données non-UUID)
ALTER TABLE book_likes 
  ALTER COLUMN book_id TYPE text USING book_id::text;
```

**⚠️ Attention :** Le rollback supprimera les foreign keys et l'intégrité référentielle.

