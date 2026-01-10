# Fix du Système de Likes - Documentation

## Date
2025-01-XX

## Problèmes Identifiés

1. **Certains livres ne peuvent plus être likés après un unlike** - L'app croit qu'un like existe encore car elle cherche seulement la clé canonique, alors que des variantes peuvent exister en DB.

2. **Section "Livres aimés" affiche des covers différentes** - Ne passe pas les mêmes props à BookCover que Library, et ne charge pas toujours les bonnes données depuis books.

3. **Social feed : events "like" sans titre/auteur/cover** - Le JOIN books ne fonctionnait pas toujours, et les props pour BookCover n'étaient pas complètes.

## Corrections Appliquées

### 1. `toggleBookLike()` - Idempotent + Candidate Keys

**Fichier:** `src/lib/bookSocial.ts`

**Changements:**
- ✅ Utilise `candidateBookKeysFromBook()` pour détecter les likes existants (toutes variantes)
- ✅ UNLIKE: Supprime **toutes les variantes** de clés (pas seulement canonique)
- ✅ LIKE: Utilise `upsert` avec clé canonique uniquement (jamais de variante)
- ✅ Supprime les `activity_events` correspondants (par `book_key` variantes ET `book_id`)
- ✅ Recalcule le count sur la clé canonique uniquement
- ✅ Logs de debug avec `{canonicalKey, candidateCount, deletedRows, upsertResult}`
- ✅ Protection: retourne gracefully si `bookKey === 'unknown'`

**Code clé:**
```typescript
// Check avec toutes les variantes
const candidateKeys = candidateBookKeysFromBook(bookKey);
const { data: existing } = await supabase
  .from('book_likes')
  .select('user_id, book_key')
  .eq('user_id', userId)
  .in('book_key', candidateKeys);

// UNLIKE: supprimer toutes variantes
await supabase
  .from('book_likes')
  .delete()
  .eq('user_id', userId)
  .in('book_key', candidateKeys);

// LIKE: upsert avec clé canonique uniquement
const canonicalKey = canonicalBookKey({ book_key: bookKey }) || bookKey;
await supabase
  .from('book_likes')
  .upsert({
    user_id: userId,
    book_key: canonicalKey, // ✅ Toujours canonique
    book_uuid: bookId,
    book_id: bookId,
  }, {
    onConflict: 'user_id,book_key',
  });
```

### 2. Social Feed - JOIN Books + Props Complètes

**Fichiers:** `src/pages/SocialFeed.tsx`, `src/components/FeedRow.tsx`

**Changements:**
- ✅ Charge les books manquants si JOIN échoué (via `book_uuid`)
- ✅ Affiche toujours BookCover (même sans `cover_url`, gère les fallbacks)
- ✅ Passe toutes les props nécessaires à BookCover: `openlibrary_cover_id`, `isbn`, `google_books_id`
- ✅ Fallback si book absent: "un livre" au lieu de "Livre"

**Code clé:**
```typescript
// Charger books manquants
const missingBookUuids = eventsData
  .filter((e: any) => e.book_uuid && !e.book)
  .map((e: any) => e.book_uuid);

if (missingBookUuids.length > 0) {
  const { data: missingBooks } = await supabase
    .from('books')
    .select('id, title, author, cover_url, openlibrary_cover_id, isbn, google_books_id, openlibrary_work_key')
    .in('id', missingBookUuids);
  // ... ajouter à booksMap
}

// BookCover avec toutes props
<BookCover
  coverUrl={event.book?.cover_url || null}
  title={event.book?.title || 'Livre'}
  author={event.book?.author || ''}
  openlibrary_cover_id={event.book?.openlibrary_cover_id ?? null}
  isbn={event.book?.isbn ?? null}
  googleCoverUrl={...}
/>
```

### 3. "Livres aimés" - JOIN Books + Props Identiques

**Fichiers:** `src/pages/Profile.tsx`, `src/components/ProfileLayout.tsx`, `src/components/UserLibraryView.tsx`

**Changements:**
- ✅ `loadLikedBooks()` fait déjà JOIN avec `books` via `book_uuid` (déjà correct)
- ✅ `ProfileLayout` passe toutes les props à BookCover (isbn, openlibrary_cover_id, googleCoverUrl)
- ✅ `UserLibraryView.loadLikedBooks()` utilise maintenant `book_likes` + JOIN `books` au lieu de `activity_events` + `books_cache`
- ✅ BookCover reçoit les mêmes props que dans Library

**Code clé:**
```typescript
// Profile.tsx (déjà correct)
const { data: likesData } = await supabase
  .from('book_likes')
  .select(`
    book_uuid,
    book_key,
    books:books!book_likes_book_uuid_fkey (
      id, title, author, cover_url, isbn,
      openlibrary_cover_id, google_books_id, openlibrary_work_key
    )
  `)

// UserLibraryView.tsx (corrigé)
// Maintenant utilise book_likes + JOIN books au lieu de activity_events + books_cache

// ProfileLayout.tsx (corrigé)
<BookCover
  coverUrl={book.cover_url || null}
  isbn={book.isbn || null}
  openlibrary_cover_id={book.openlibrary_cover_id || null}
  googleCoverUrl={book.google_books_id ? ... : null}
/>
```

## Recommandations SQL

### 1. Contrainte Unique sur `book_likes`

**Migration SQL:**
```sql
-- S'assurer que la contrainte unique existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'book_likes_user_id_book_key_key'
  ) THEN
    ALTER TABLE book_likes
    ADD CONSTRAINT book_likes_user_id_book_key_key 
    UNIQUE (user_id, book_key);
  END IF;
END $$;

-- Index pour performance
CREATE INDEX IF NOT EXISTS idx_book_likes_book_key 
ON book_likes(book_key);

CREATE INDEX IF NOT EXISTS idx_book_likes_user_id 
ON book_likes(user_id);
```

### 2. Contrainte Unique sur `activity_events`

**Migration SQL:**
```sql
-- S'assurer que la contrainte unique existe pour éviter les doublons
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'activity_events_actor_event_book_key_key'
  ) THEN
    ALTER TABLE activity_events
    ADD CONSTRAINT activity_events_actor_event_book_key_key 
    UNIQUE (actor_id, event_type, book_key);
  END IF;
END $$;

-- Index pour performance
CREATE INDEX IF NOT EXISTS idx_activity_events_book_key 
ON activity_events(book_key);

CREATE INDEX IF NOT EXISTS idx_activity_events_book_uuid 
ON activity_events(book_uuid);
```

### 3. Migration de Normalisation (Optionnel)

**Script pour normaliser les anciens likes:**

```sql
-- Nettoyer les likes avec variantes (garder seulement canonique)
-- Cette migration peut être exécutée une fois pour purger l'historique

-- 1. Identifier les doublons (même user_id, clés variantes du même livre)
WITH normalized_likes AS (
  SELECT 
    bl1.id,
    bl1.user_id,
    bl1.book_key,
    bl1.book_uuid,
    -- Essayer de trouver la clé canonique
    COALESCE(
      CASE WHEN bl1.book_key LIKE 'isbn:%' THEN bl1.book_key END,
      CASE WHEN bl1.book_key LIKE 'ol:/works/%' THEN bl1.book_key END,
      CASE WHEN bl1.book_key LIKE 'gb:%' THEN bl1.book_key END,
      -- Si pas de préfixe, chercher via book_uuid pour trouver la clé canonique
      (SELECT canonical_key FROM (
        SELECT 
          CASE 
            WHEN b.isbn IS NOT NULL THEN 'isbn:' || REGEXP_REPLACE(b.isbn, '[^0-9Xx]', '', 'g')
            WHEN b.openlibrary_work_key IS NOT NULL THEN 'ol:' || b.openlibrary_work_key
            WHEN b.google_books_id IS NOT NULL THEN 'gb:' || b.google_books_id
            ELSE bl1.book_key
          END as canonical_key
        FROM books b
        WHERE b.id = bl1.book_uuid
        LIMIT 1
      ) sub)
    ) as canonical_key
  FROM book_likes bl1
)
-- 2. Supprimer les likes non-canoniques si un like canonique existe pour le même user+book
DELETE FROM book_likes bl
WHERE EXISTS (
  SELECT 1 FROM normalized_likes nl1
  WHERE nl1.user_id = bl.user_id
    AND nl1.book_uuid = bl.book_uuid
    AND nl1.canonical_key IS NOT NULL
    AND nl1.canonical_key != bl.book_key
    AND EXISTS (
      SELECT 1 FROM normalized_likes nl2
      WHERE nl2.user_id = nl1.user_id
        AND nl2.book_uuid = nl1.book_uuid
        AND nl2.book_key = nl1.canonical_key
    )
);

-- 3. Mettre à jour les likes restants vers clé canonique si nécessaire
-- (À adapter selon votre logique de normalisation)
```

**⚠️ ATTENTION:** Cette migration est destructive. Testez d'abord sur un environnement de staging.

### 4. Vue pour Feed Optimisée (Optionnel)

**Créer une vue pour simplifier les requêtes feed:**

```sql
CREATE OR REPLACE VIEW activity_events_with_books AS
SELECT 
  ae.id,
  ae.actor_id,
  ae.event_type,
  ae.book_key,
  ae.book_uuid,
  ae.book_id,
  ae.comment_id,
  ae.created_at,
  b.title as book_title,
  b.author as book_author,
  b.cover_url as book_cover_url,
  b.openlibrary_cover_id as book_openlibrary_cover_id,
  b.isbn as book_isbn,
  b.google_books_id as book_google_books_id,
  b.openlibrary_work_key as book_openlibrary_work_key,
  up.display_name as actor_display_name,
  up.username as actor_username,
  up.avatar_url as actor_avatar_url
FROM activity_events ae
LEFT JOIN books b ON b.id = ae.book_uuid
LEFT JOIN user_profiles up ON up.id = ae.actor_id;

-- Index pour performance
CREATE INDEX IF NOT EXISTS idx_activity_events_created_at 
ON activity_events(created_at DESC);
```

## Tests Recommandés

1. **Test re-like après unlike:**
   - Like un livre
   - Unlike le livre
   - Re-like le livre → doit fonctionner

2. **Test variantes de clés:**
   - Créer un like avec clé non-canonique (legacy)
   - Unlike → doit supprimer toutes variantes
   - Re-like → doit créer avec clé canonique uniquement

3. **Test covers:**
   - Vérifier que "Livres aimés" affiche les mêmes covers que Library
   - Vérifier que Social Feed affiche les covers même si `cover_url` est null

4. **Test feed:**
   - Vérifier que les events "like" affichent titre/auteur/cover
   - Vérifier le fallback "un livre" si book absent

## Notes Techniques

- **Clé canonique:** Utiliser `canonicalBookKey()` pour obtenir la clé canonique
- **Candidate keys:** Utiliser `candidateBookKeysFromBook()` pour trouver toutes variantes (lecture)
- **Écriture:** Toujours utiliser clé canonique uniquement
- **Lecture:** Chercher dans toutes variantes (candidate keys) pour compatibilité historique

## Fichiers Modifiés

1. `src/lib/bookSocial.ts` - `toggleBookLike()`
2. `src/pages/SocialFeed.tsx` - JOIN books manquants, props complètes
3. `src/components/FeedRow.tsx` - Props BookCover complètes
4. `src/components/ProfileLayout.tsx` - Props BookCover complètes
5. `src/components/UserLibraryView.tsx` - Utilise `book_likes` + JOIN `books`

## Résultat Attendu

✅ Système de likes idempotent et canonique
✅ Covers identiques partout (Library, Liked Books, Feed)
✅ Titres/auteurs/cover affichés correctement dans le feed
✅ Plus de bugs "impossible de re-like après unlike"

