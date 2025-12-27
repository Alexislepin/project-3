# Fix EditBookModal et Custom Fields - Documentation

## Résumé

Correction complète de la modal "Modifier le livre" avec support des champs personnalisés (custom_*) dans `user_books`.

## Migration SQL Requise

**⚠️ IMPORTANT**: Exécutez cette migration SQL dans Supabase avant d'utiliser les fonctionnalités :

```sql
-- Add custom fields to user_books for per-user book customizations
-- These fields allow users to override book metadata (title, author, pages, cover, description)
-- without affecting the global books table

ALTER TABLE user_books
ADD COLUMN IF NOT EXISTS custom_title text,
ADD COLUMN IF NOT EXISTS custom_author text,
ADD COLUMN IF NOT EXISTS custom_total_pages integer,
ADD COLUMN IF NOT EXISTS custom_description text,
ADD COLUMN IF NOT EXISTS custom_cover_url text;

-- Add comments to document these fields
COMMENT ON COLUMN user_books.custom_title IS 'User-specific title override for this book';
COMMENT ON COLUMN user_books.custom_author IS 'User-specific author override for this book';
COMMENT ON COLUMN user_books.custom_total_pages IS 'User-specific page count override for this book';
COMMENT ON COLUMN user_books.custom_description IS 'User-specific description/notes for this book';
COMMENT ON COLUMN user_books.custom_cover_url IS 'User-specific cover URL override for this book';
```

**Note sur RLS** : Les politiques RLS existantes permettent déjà aux utilisateurs de mettre à jour leurs propres lignes `user_books` (`auth.uid() = user_id`). Aucune politique supplémentaire n'est nécessaire pour ces champs personnalisés.

## Modifications Apportées

### 1. EditBookModal (`src/components/EditBookModal.tsx`)

- ✅ Ajout de logs détaillés (payload, user id, userBookId, résultat Supabase)
- ✅ Vérification de `user.id` via `useAuth()`
- ✅ Update sur `user_books` (id = userBookId) avec les champs `custom_*`
- ✅ **NE JAMAIS** update la table `books` (ces champs sont per-user)
- ✅ Après succès : appel à `onSaved()` + fermeture modal + toast "Enregistré"
- ✅ En cas d'erreur : affichage toast erreur et modal reste ouverte
- ✅ Fix UI : z-index z-[999] pour overlay, z-[1000] pour modal
- ✅ Fix centrage : flex items-center justify-center
- ✅ Fix safe-area : paddingBottom avec env(safe-area-inset-bottom)
- ✅ Fix structure : formulaire dans div scrollable, boutons dans sticky footer

### 2. Library.tsx (`src/pages/Library.tsx`)

#### Affichage avec custom_* fields

- ✅ Utilisation en priorité des champs `custom_*` de `user_books` si présents :
  - `displayTitle = userBook.custom_title ?? book.title`
  - `displayAuthor = userBook.custom_author ?? book.author`
  - `displayPages = userBook.custom_total_pages ?? book.total_pages ?? null`
  - `displayCover = userBook.custom_cover_url ?? book.cover_url ?? null`
- ✅ Le progress utilise `displayPages` (donc `custom_total_pages` si rempli)
- ✅ Le label "Pages inconnues" disparaît si `custom_total_pages` est renseigné
- ✅ `loadUserBooks()` sélectionne maintenant les colonnes `custom_*`
- ✅ `EditBookModal` reçoit les valeurs initiales depuis `custom_*` ou `book.*`

#### Cacher FAB "+" quand une modal est ouverte

- ✅ Condition ajoutée pour cacher le FAB :
  ```tsx
  {filter !== 'explore' && !(detailsBookId || showScanner || loadingSelected || selectedDbBook || selectedBookDetails || selectedBookForComments || bookToAdd || bookToManage || showManualAdd || bookToEdit || recapOpen) && (
    <button ...>FAB</button>
  )}
  ```

### 3. AddManualBookModal (`src/components/AddManualBookModal.tsx`)

- ✅ Ajout de logs détaillés (user id, book data, user book data, résultats Supabase)
- ✅ Vérification de `user.id` via `supabase.auth.getUser()`
- ✅ Affichage des erreurs avec message, code, details, hint
- ✅ Suppression du champ `progress_pct` (n'existe pas dans `user_books`)
- ✅ Gestion d'erreur : affichage toast et ne pas fail silencieusement

## Comportement Attendu

1. **Modifier un livre** :
   - L'utilisateur clique sur "3 points" > "Modifier le livre"
   - La modal s'ouvre avec les valeurs actuelles (custom_* si présents, sinon book.*)
   - L'utilisateur modifie les champs
   - Clic sur "Enregistrer"
   - Les champs `custom_*` sont mis à jour dans `user_books`
   - La modal se ferme avec un toast de succès
   - L'UI se rafraîchit automatiquement avec les nouvelles valeurs

2. **Affichage des livres** :
   - Si `custom_title` existe → affiche `custom_title`, sinon `book.title`
   - Si `custom_author` existe → affiche `custom_author`, sinon `book.author`
   - Si `custom_total_pages` existe → affiche `custom_total_pages`, sinon `book.total_pages`
   - Si `custom_cover_url` existe → affiche `custom_cover_url`, sinon `book.cover_url`
   - Le progress bar utilise les pages personnalisées si présentes

3. **FAB "+"** :
   - Caché quand n'importe quelle modal est ouverte
   - Visible seulement dans les onglets reading/want_to_read/completed (pas explore)

## Dépannage

### Erreur "permission denied" ou "new row violates row-level security"

Si vous obtenez une erreur RLS lors de l'update dans `EditBookModal`, vérifiez que la politique RLS suivante existe :

```sql
-- Cette politique devrait déjà exister, mais vérifiez :
SELECT * FROM pg_policies WHERE tablename = 'user_books' AND policyname LIKE '%update%';

-- Si elle n'existe pas, créez-la :
CREATE POLICY "Users can update their own user_books"
ON user_books
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
```

### Erreur "column does not exist: custom_title"

Vous devez exécuter la migration SQL ci-dessus pour ajouter les colonnes `custom_*` à la table `user_books`.

## Fichiers Modifiés

1. `supabase/migrations/20250202000000_add_custom_fields_to_user_books.sql` (nouveau)
2. `src/components/EditBookModal.tsx`
3. `src/components/AddManualBookModal.tsx`
4. `src/pages/Library.tsx`

## Tests Recommandés

1. ✅ Modifier un livre et vérifier que les valeurs sont sauvegardées
2. ✅ Vérifier que les valeurs personnalisées s'affichent dans la liste
3. ✅ Vérifier que le progress bar utilise les pages personnalisées
4. ✅ Vérifier que le FAB "+" est caché quand une modal est ouverte
5. ✅ Vérifier que "Pages inconnues" disparaît si custom_total_pages est rempli
6. ✅ Ajouter un livre manuellement et vérifier qu'il s'ajoute correctement

