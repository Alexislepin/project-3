# Corrections iOS Lexu - Version 2

## Fichiers modifiés

### 1. Safe Area Top (partout)
- ✅ `src/index.css` - Variables CSS `--sat` et `--sab`
- ✅ `src/pages/Home.tsx` - Safe area sur header sticky
- ✅ `src/pages/Library.tsx` - Safe area sur header sticky
- ✅ `src/pages/Profile.tsx` - Safe area sur headers sticky (2 occurrences)
- ✅ `src/pages/Search.tsx` - Safe area sur header sticky

### 2. Swipe Back iOS (edge swipe)
- ✅ `src/lib/swipeBack.ts` - Nouveau fichier pour détecter edge swipe
- ✅ `src/App.tsx` - Initialisation de `initSwipeBack()` au mount

### 3. Swipe Horizontal entre Onglets (Bibliothèque)
- ✅ `src/lib/swipeableTabs.tsx` - Nouveau composant SwipeableTabs
- ⚠️ `src/pages/Library.tsx` - Import ajouté (intégration complète nécessite refactoring)

### 4. Réparation Couvertures (OpenLibrary/Google fallback)
- ✅ `src/services/openLibrary.ts` - Suppression de `?default=false` dans `getCoverUrl()`
- ✅ `src/services/openLibrary.ts` - Suppression de `?default=false` dans `fetchByIsbn()`
- ✅ `src/lib/googleBooks.ts` - Suppression de `?default=false` dans `resolveCoverUrl()`
- ✅ `src/utils/coverResolver.ts` - Suppression de `?default=false` + priorité Google Books
- ✅ `src/components/BookCover.tsx` - Fallback automatique OpenLibrary si image échoue

## Commandes à exécuter

Aucune nouvelle dépendance nécessaire. Les corrections utilisent uniquement du code natif.

## Comment tester sur iPhone via Xcode

1. **Ouvrir Xcode** : `cd ios/App && open App.xcodeproj`
2. **Sélectionner iPhone avec notch** (ex: iPhone 14 Pro)
3. **Build & Run** : `Cmd + R`
4. **Tests** :
   - Safe Area : Vérifier que "Fil d'actualité" et "Ma Bibliothèque" ne passent pas sous le notch
   - Swipe Back : Depuis Profile → autre page, swipe depuis bord gauche → doit revenir
   - Couvertures : Scanner un ISBN ou explorer → couvertures doivent s'afficher (avec fallback si nécessaire)

## Checklist "Done / To verify"

### ✅ Done (Code modifié)
- [x] Safe Area CSS variables définies
- [x] Safe Area appliqué sur tous les headers (Home, Library, Profile, Search)
- [x] Swipe back iOS initialisé dans App.tsx
- [x] `?default=false` supprimé de toutes les URLs OpenLibrary
- [x] Fallback OpenLibrary ajouté dans BookCover.tsx
- [x] Priorité Google Books > OpenLibrary dans coverResolver.ts

### ⚠️ Partiel
- [x] SwipeableTabs créé
- [ ] SwipeableTabs intégré dans Library.tsx (nécessite refactoring de la structure)

### ⚠️ To Verify (Tests à faire)
- [ ] Safe Area : Titres visibles sans scroller sur iPhone avec notch
- [ ] Swipe Back : Edge swipe fonctionne depuis pages secondaires
- [ ] Swipe Back : Ne casse pas les swipes horizontaux de Bibliothèque
- [ ] Couvertures : S'affichent dans Explorer, Bibliothèque, après scan
- [ ] Couvertures : Fallback OpenLibrary fonctionne si Google Books échoue
- [ ] Couvertures : Placeholder propre si aucune cover disponible

## Note importante

**Swipe Horizontal entre Onglets** : Le composant `SwipeableTabs` est créé mais nécessite une refactorisation de `Library.tsx` pour extraire le contenu de chaque onglet (En cours, À lire, Terminé, Explorer) en composants séparés. Pour l'instant, les onglets fonctionnent toujours au tap, mais le swipe horizontal n'est pas encore actif.

Pour activer le swipe horizontal, il faudrait :
1. Extraire le contenu de chaque onglet dans des fonctions/composants séparés
2. Wrapper le tout dans `<SwipeableTabs>` avec 4 enfants
3. Gérer le state `filter` via `onTabChange`

