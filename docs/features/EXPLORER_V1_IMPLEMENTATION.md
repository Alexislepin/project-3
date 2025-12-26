# Explorer V1 - Implémentation

## ✅ Modifications Appliquées

### 1) Seed Local Intégré
- **Fichier**: `src/data/frenchBooksSeed.json` (173 livres FR)
- **Utilisation**: Source principale d'Explorer (remplace `fetchBySubject`)
- **Affichage**: Instantané (< 1s), pas d'attente réseau

### 2) Conversion Seed → UiBook
- **Fonction**: `seedItemToUiBook()` dans `Library.tsx`
- **ID stable**: Basé sur ISBN ou `seed:index:title`
- **Props**: `isbn13`, `isbn10`, `title`, `author`
- **Cover**: `undefined` initialement (enrichi en background)

### 3) Enrichissement Asynchrone
- **Fonction**: `enrichExplorerBooks()` dans `Library.tsx`
- **Source**: Google Books API via `searchBookByISBN()`
- **Batch**: 5 livres par batch avec délai 200ms
- **Mise à jour**: Seulement si cover valide trouvée
- **Non bloquant**: UI reste responsive pendant l'enrichissement

### 4) Scroll Infini
- **Basé sur**: Index dans le seed (`explorerSeedIndex`)
- **Pagination**: 20 livres par page
- **hasMore**: `explorerSeedIndex + LIMIT_PER_PAGE < frenchBooksSeed.length`
- **Sentinel**: `IntersectionObserver` sur `loadMoreRef`

### 5) Recherche Instantanée
- **Source**: Seed local (filtre title + author, case-insensitive)
- **Debounce**: 300ms
- **Enrichissement**: Background via Google Books (même logique que Explorer)

### 6) Filtre Cover Obligatoire
- **Règle**: Afficher uniquement si `isbn13 || isbn10 || thumbnail || googleCoverUrl`
- **Placeholder**: Jamais affiché dans Explorer (livres sans cover = skip)
- **BookCover**: Utilise sa logique de fallback (Google > OpenLibrary ISBN > OpenLibrary ID)

## 📁 Fichiers Modifiés

1. **`src/pages/Library.tsx`**:
   - Import `frenchBooksSeed.json`
   - Import `searchBookByISBN` de `googleBooks.ts`
   - Ajout `explorerSeedIndex` et `enrichingBooks` states
   - Remplacement `loadExplorerBooks()` (seed local au lieu de Subjects API)
   - Nouvelle fonction `seedItemToUiBook()`
   - Nouvelle fonction `enrichExplorerBooks()`
   - Modification `handleSearch()` pour Explorer (recherche seed local)
   - Filtre cover obligatoire dans le rendu Explorer

2. **`src/data/frenchBooksSeed.json`** (déjà créé):
   - 173 livres français classiques et populaires
   - Format: `{ title, author, isbn13, lang: "fr" }`

## 🎯 Résultat Attendu

- ✅ Explorer affiche des livres en < 1 seconde
- ✅ Scroll infini fluide (20 livres par page)
- ✅ Recherche instantanée sur le seed
- ✅ Covers enrichies en background (Google Books)
- ✅ Pas de placeholder dans Explorer (livres sans cover = skip)
- ✅ Livres FR uniquement (seed curé)

## 🔍 Points d'Attention

1. **Enrichissement**: Les covers peuvent apparaître progressivement (enrichissement asynchrone)
2. **Filtre Cover**: Un livre sans ISBN ni cover sera filtré (pas affiché)
3. **Seed Limit**: 173 livres dans le seed → ~8-9 pages de scroll infini
4. **Recherche**: Recherche uniquement sur le seed local (pas d'API externe)

## 🧪 Tests à Effectuer

1. Ouvrir Explorer → Vérifier affichage instantané (< 1s)
2. Scroller jusqu'en bas → Vérifier scroll infini (chargement page suivante)
3. Rechercher "Camus" → Vérifier résultats instantanés
4. Vérifier que les covers s'enrichissent progressivement
5. Vérifier qu'aucun placeholder n'apparaît dans Explorer

