# Fix Covers Custom - Fonction Unique computeDisplayCoverUrl()

## Date
2025-01-XX

## Objectif

Créer une fonction unique `computeDisplayCoverUrl()` utilisée **PARTOUT** dans l'app pour gérer les covers avec support des covers custom de l'utilisateur.

## Problèmes Résolus

1. ✅ **Fonction unique** : Tous les écrans utilisent maintenant `computeDisplayCoverUrl()`
2. ✅ **Cover custom dans "Livres aimés"** : Le profil charge maintenant la cover custom de l'utilisateur
3. ✅ **Cover custom dans Social Feed** : Les events "aimé un livre" affichent la cover custom de l'acteur
4. ✅ **Cohérence** : Les covers sont identiques partout (Library, Liked Books, Feed)

## Implémentation

### 1. Fonction Unique `computeDisplayCoverUrl()`

**Fichier:** `src/lib/covers.ts`

```typescript
export function computeDisplayCoverUrl(params: {
  book: any;
  bookKey?: string | null;
  actorCustomCoverUrl?: string | null; // cover perso de l'utilisateur qui like/post
}): string | null {
  const { book, bookKey, actorCustomCoverUrl } = params;

  // 1) Cover custom (priorité absolue)
  if (actorCustomCoverUrl && actorCustomCoverUrl.trim().length > 0) {
    return actorCustomCoverUrl.trim();
  }

  // 2) Cover stockée dans books
  if (book?.cover_url && book.cover_url.trim().length > 0) {
    return book.cover_url;
  }

  // 3) OpenLibrary cover ID
  if (typeof book?.openlibrary_cover_id === 'number' && book.openlibrary_cover_id > 0) {
    return `https://covers.openlibrary.org/b/id/${book.openlibrary_cover_id}-L.jpg`;
  }

  // 4) Google Books ID
  if (book?.google_books_id && book.google_books_id.trim().length > 0) {
    return `https://books.google.com/books/content?id=${book.google_books_id}&printsec=frontcover&img=1&zoom=1&source=gbs_api`;
  }

  // 5) Fallback depuis bookKey (ISBN / OL work)
  const fallbackUrl = computeCoverUrl(book, bookKey || undefined);
  if (fallbackUrl) return fallbackUrl;

  // 6) book_cover_url fallback
  if (book?.book_cover_url && book.book_cover_url.trim().length > 0) {
    return book.book_cover_url;
  }

  return null;
}
```

**Priorité:**
1. `actorCustomCoverUrl` (priorité absolue)
2. `book.cover_url`
3. OpenLibrary cover ID
4. Google Books cover URL
5. Fallback depuis bookKey (ISBN / OL work)
6. `book.book_cover_url`

### 2. "Livres aimés" dans Profile.tsx

**Fichier:** `src/pages/Profile.tsx`

**Changements:**
- ✅ Charge les covers custom depuis `book_covers` (ou `user_books.custom_cover_url` en fallback)
- ✅ Mappe les covers custom dans les données
- ✅ Passe `actor_custom_cover_url` à ProfileLayout

**Code clé:**
```typescript
// Charger book_likes avec JOIN books
const { data: likesData } = await supabase
  .from('book_likes')
  .select(`
    book_uuid,
    book_key,
    books:books!book_likes_book_uuid_fkey (...)
  `)
  .eq('user_id', profileId);

// Charger covers custom
const bookIds = likesData.map(x => x.book_uuid).filter(Boolean);

// Essayer book_covers d'abord
const { data: coversData } = await supabase
  .from('book_covers')
  .select('book_id, cover_url')
  .eq('user_id', profileId)
  .in('book_id', bookIds);

// Fallback: user_books.custom_cover_url
// ...

const coverMap = new Map(coversData.map(c => [c.book_id, c.cover_url]));

const cleaned = likesData.map(x => ({
  book: x.books,
  actor_custom_cover_url: coverMap.get(x.book_uuid) ?? null,
}));
```

### 3. ProfileLayout - Rendu avec computeDisplayCoverUrl

**Fichier:** `src/components/ProfileLayout.tsx`

**Changements:**
- ✅ Import `computeDisplayCoverUrl`
- ✅ Utilise `computeDisplayCoverUrl()` pour calculer la cover finale
- ✅ Passe `actor_custom_cover_url` depuis les données

**Code clé:**
```typescript
const coverUrl = computeDisplayCoverUrl({
  book,
  bookKey: item.book_key,
  actorCustomCoverUrl: item.actor_custom_cover_url || null,
});

<BookCover
  coverUrl={coverUrl}
  title={book.title || 'Livre'}
  author={book.author || ''}
  // ... autres props
/>
```

### 4. Social Feed - Covers Custom des Acteurs

**Fichier:** `src/pages/SocialFeed.tsx`

**Changements:**
- ✅ Charge les covers custom pour tous les acteurs
- ✅ Utilise `computeDisplayCoverUrl()` pour chaque event
- ✅ Affiche la cover custom de l'acteur dans les events "aimé un livre"

**Code clé:**
```typescript
// Charger covers custom pour tous les (actor_id, book_id) pairs
const actorIds = Array.from(new Set(eventsData.map(e => e.actor_id)));
const allBookUuids = Array.from(new Set([
  ...eventsData.map(e => e.book_uuid),
  ...Array.from(booksMap.keys()),
]));

const { data: coversData } = await supabase
  .from('book_covers')
  .select('user_id, book_id, cover_url')
  .in('user_id', actorIds)
  .in('book_id', allBookUuids);

const customCoversMap = new Map(
  coversData.map(c => [`${c.user_id}:${c.book_id}`, c.cover_url])
);

// Pour chaque event
const actorCustomCoverUrl = event.book_uuid && actor.id
  ? customCoversMap.get(`${actor.id}:${event.book_uuid}`) ?? null
  : null;

const displayCoverUrl = computeDisplayCoverUrl({
  book: book || {},
  bookKey: event.book_key || null,
  actorCustomCoverUrl,
});
```

### 5. UserLibraryView - Covers Custom

**Fichier:** `src/components/UserLibraryView.tsx`

**Changements:**
- ✅ Charge les covers custom pour les liked books
- ✅ Utilise `computeDisplayCoverUrl()` dans le rendu
- ✅ Support pour `user_books.custom_cover_url` et `book_covers`

**Code clé:**
```typescript
// Dans loadLikedBooks()
const coverMap = new Map(
  coversData.map(c => [c.book_id, c.cover_url])
);

const formattedBooks = likesData.map(x => ({
  book: x.book,
  custom_cover_url: coverMap.get(x.book_uuid) ?? null,
}));

// Dans le rendu
const coverUrl = computeDisplayCoverUrl({
  book,
  bookKey: undefined,
  actorCustomCoverUrl: userBook.custom_cover_url || null,
});
```

## Comportement Attendu

### Règle: "Si je change ma cover, les autres doivent la voir dans mes activités"

✅ **Comportement:**
- L'utilisateur change sa cover custom → `book_covers` est upsert
- Quand quelqu'un voit son activité ou ses likes → il voit `book_covers.cover_url` (car `user_id` = acteur)
- Ça n'impacte pas les autres utilisateurs dans leur bibliothèque (ils gardent leur cover)

### Exemple de Flux

1. **User A** a un livre avec cover custom dans sa bibliothèque
2. **User A** like ce livre
3. Dans le **Social Feed**, **User B** voit: "User A a aimé [Livre]" avec **la cover custom de User A**
4. Dans le **Profil de User A**, "Livres aimés" affiche **sa cover custom**
5. Si **User A** change sa cover → elle est mise à jour partout (feed, profil)

## Tables Utilisées

### Option 1: `book_covers` (Recommandé)

```sql
CREATE TABLE book_covers (
  user_id uuid REFERENCES user_profiles(id) ON DELETE CASCADE,
  book_id uuid REFERENCES books(id) ON DELETE CASCADE,
  cover_url text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, book_id)
);
```

### Option 2: `user_books.custom_cover_url` (Fallback)

Si `book_covers` n'existe pas, le code utilise `user_books.custom_cover_url` en fallback.

## Migration SQL (Optionnel)

Si vous voulez créer la table `book_covers`:

```sql
-- Créer table book_covers si elle n'existe pas
CREATE TABLE IF NOT EXISTS book_covers (
  user_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  book_id uuid NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  cover_url text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, book_id)
);

-- Index pour performance
CREATE INDEX IF NOT EXISTS idx_book_covers_user_id ON book_covers(user_id);
CREATE INDEX IF NOT EXISTS idx_book_covers_book_id ON book_covers(book_id);

-- RLS Policies
ALTER TABLE book_covers ENABLE ROW LEVEL SECURITY;

-- Users can read all covers (public)
CREATE POLICY "book_covers_select_public" ON book_covers
  FOR SELECT
  USING (true);

-- Users can insert/update/delete their own covers
CREATE POLICY "book_covers_modify_own" ON book_covers
  FOR ALL
  USING (auth.uid() = user_id);
```

## Fichiers Modifiés

1. ✅ `src/lib/covers.ts` - Nouvelle fonction `computeDisplayCoverUrl()`
2. ✅ `src/pages/Profile.tsx` - Charge covers custom dans `loadLikedBooks()`
3. ✅ `src/components/ProfileLayout.tsx` - Utilise `computeDisplayCoverUrl()`
4. ✅ `src/pages/SocialFeed.tsx` - Charge covers custom et utilise `computeDisplayCoverUrl()`
5. ✅ `src/components/UserLibraryView.tsx` - Charge covers custom et utilise `computeDisplayCoverUrl()`

## Tests Recommandés

1. **Test cover custom dans "Livres aimés":**
   - Créer une cover custom pour un livre dans Library
   - Vérifier que cette cover apparaît dans "Livres aimés" du profil
   - Changer la cover → doit se mettre à jour partout

2. **Test cover custom dans Social Feed:**
   - User A a une cover custom pour un livre
   - User A like ce livre
   - User B voit dans le feed: cover custom de User A
   - User A change sa cover → User B voit la nouvelle cover

3. **Test priorité:**
   - Cover custom > cover stockée > OpenLibrary > Google Books > fallback

## Résultat

✅ **Fonction unique `computeDisplayCoverUrl()` utilisée PARTOUT**  
✅ **Covers custom visibles dans "Livres aimés"**  
✅ **Covers custom visibles dans Social Feed**  
✅ **Covers identiques partout (Library, Liked Books, Feed)**  
✅ **"Si je change ma cover, les autres doivent la voir dans mes activités"**

