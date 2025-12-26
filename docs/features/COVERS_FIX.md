# Fix Couvertures - Stratégie Robuste

## Problème identifié
- OpenLibrary ISBN renvoie souvent 404 (ex: `9782226429537-L.jpg` 404)
- Fallback archive.org ne fonctionne pas (ERR_CONNECTION_RESET)
- Résultat : zéro couverture affichée

## Solution implémentée

### 1. Stratégie de fallback (ordre de priorité)
1. **OpenLibrary cover_i** (ID de couverture) - `https://covers.openlibrary.org/b/id/{cover_i}-L.jpg`
   - Plus fiable que ISBN
   - Utilisé si disponible dans les données OpenLibrary
2. **OpenLibrary ISBN** - `https://covers.openlibrary.org/b/isbn/{isbn}-L.jpg`
   - Fallback si cover_i non disponible
3. **Google Books** - `volumeInfo.imageLinks.thumbnail` ou `smallThumbnail`
   - Fallback si OpenLibrary échoue
4. **Placeholder local** - `/placeholder-cover.svg`
   - Dernier recours si toutes les sources échouent

### 2. Implémentation dans BookCover.tsx
- State machine avec `currentSource` qui gère les fallbacks
- `onError` sur `<img>` déclenche automatiquement le fallback suivant
- Logs console temporaires pour debug (affichent la source utilisée)

### 3. Modifications des données
- `OpenLibraryBook` interface : ajout de `cover_i?: number`
- `normalizeBook()` : extraction de `cover_i` depuis `doc.cover_i`
- `fetchByIsbn()` : inclusion de `cover_i` dans le résultat
- `Book` interface (Google Books) : ajout de `cover_i?` et `googleCoverUrl?`
- `normalizeGoogleBook()` : extraction de `googleCoverUrl` depuis `imageLinks`

### 4. Mise à jour des appels BookCover
- `Library.tsx` : tous les appels passent maintenant `cover_i` et `googleCoverUrl`
- Explorer, Search Results, User Books : tous mis à jour

## Fichiers modifiés

1. **`src/components/BookCover.tsx`**
   - Refactorisation complète avec state machine
   - Gestion des fallbacks via `onError`
   - Logs console temporaires

2. **`src/services/openLibrary.ts`**
   - Interface `OpenLibraryBook` : ajout `cover_i`
   - `normalizeBook()` : extraction `cover_i`
   - `fetchByIsbn()` : inclusion `cover_i` dans résultat

3. **`src/lib/googleBooks.ts`**
   - Interface `Book` : ajout `cover_i?` et `googleCoverUrl?`
   - `normalizeGoogleBook()` : extraction `googleCoverUrl`

4. **`src/pages/Library.tsx`**
   - Mappings OpenLibrary → GoogleBook : inclusion `cover_i`
   - Tous les appels `BookCover` : ajout `cover_i` et `googleCoverUrl`

## Suppression archive.org

✅ Aucune référence à `archive.org` trouvée dans le code (déjà supprimé)

## Logs console (temporaires)

Les logs suivants apparaissent dans la console pour chaque livre :
- `[BookCover] {title}: Using source {type} - {url}`
- `[BookCover] {title}: Fallback to {type} - {url}` (si fallback)
- `[BookCover] {title}: All sources failed, showing placeholder` (si tout échoue)

## Acceptance Tests

### ✅ À vérifier
- [ ] Bibliothèque : Majorité des livres ont une couverture (OpenLibrary id ou Google)
- [ ] Explorer : Majorité des livres ont une couverture
- [ ] Scan ISBN : Couverture s'affiche après scan
- [ ] Console : Logs affichent la source utilisée pour chaque livre
- [ ] Pas d'appels archive.org (vérifier Network tab)
- [ ] Pas d'images cassées (broken img) - placeholder affiché si nécessaire

## Notes techniques

- **Pas de fetch bloquant** : Utilisation de `<img onError>` pour les fallbacks
- **State machine** : `currentSource` gère l'état actuel et passe au suivant en cas d'erreur
- **Reset automatique** : `useEffect` réinitialise les sources quand les props changent
- **Placeholder** : Toujours disponible en dernier recours (`/placeholder-cover.svg`)

