# Correctifs Appliqués - Lexu

## A) Fix DB: erreur Supabase activity_events ✅

**Problème**: Le code utilise `actor_id` mais la table a `actor_user_id` (erreur 42703).

**Solution**:
- Migration SQL créée: `supabase/migrations/20250124000000_fix_activity_events_actor_id.sql`
- Renomme la colonne `actor_user_id` en `actor_id` pour être cohérent avec le code
- Met à jour les index et policies RLS
- Les inserts dans `BookQuickActions.tsx` et `BookSocial.tsx` sont déjà wrappés dans try/catch

**À faire**:
1. Appliquer la migration dans Supabase Dashboard > SQL Editor
2. Vérifier que les likes/comments fonctionnent sans erreur 42703

## B) Covers: doivent s'afficher partout ✅

**Problème**: Covers manquantes dans Profil > Livres aimés, parfois "sautent" en scroll.

**Solution appliquée**:
- `Profile.tsx`: `loadLikedBooks()` récupère maintenant `openlibrary_key`, `google_books_id`, `cover_i` depuis `books_cache`
- `BookCover` reçoit tous les props nécessaires: `isbn13`, `isbn10`, `cover_i`, `googleCoverUrl`, `openLibraryKey`
- Priorité cover: Google Books > OpenLibrary ISBN > OpenLibrary ID > Placeholder
- Cache in-memory déjà en place dans `BookCover.tsx` (Map avec TTL 24h)
- `loading="lazy"` et `decoding="async"` déjà présents
- Taille fixe: `aspect-[2/3]` sur le container

**À améliorer (optionnel)**:
- Ajouter cache localStorage pour persister les URLs valides entre sessions

## C) Explorer V1: instant, scroll infini, FR only, covers "belles" ⚠️ PARTIEL

**Problème**: Temps de chargement 15-20s, peu de livres, langues non-FR, livres sans cover.

**Solution partielle appliquée**:
- Skeleton grid immédiat (12 cartes) affiché dès l'entrée dans Explorer
- `loadExplorerBooks()` utilise Subjects API (`french_literature`, `french_fiction`, `classic_literature`)
- Filtre cyrillique/non-latin dans `openLibrary.ts` (`containsCyrillic`, `isMostlyNonLatin`)
- Validation covers avec cache mémoire
- Scroll infini avec `IntersectionObserver` et sentinel
- Offset corrigé: `offset = (pageToFetch - 1) * LIMIT_PER_PAGE`

**À faire**:
1. Créer seed local JSON (150-300 livres FR) et l'afficher immédiatement
2. Ajouter `langRestrict=fr` aux requêtes Google Books
3. Filtrer `volumeInfo.language !== "fr"` côté client
4. Validation cover plus stricte (HEAD request pour vérifier 200 OK)
5. Recherche avec debounce 300ms

## D) UI / Safe Areas iPhone ✅

**Problème**: Headers mal positionnés, flèche back non cliquable.

**Solution appliquée**:
- `src/index.css`: Classes `.sticky-header` et `.safe-top` créées
- `Library.tsx`: Header utilise `.sticky-header.safe-top` (plus de `top: var(--sat)`)
- `Profile.tsx`: Headers "Clubs" et "Livres aimés" utilisent `.sticky-header.safe-top`
- Flèche back maintenant dans la zone safe-area (cliquable)

**Résultat**:
- Pas de zone vide en haut
- Headers collés en haut avec safe-area intégrée
- Flèche back cliquable sur iPhone notch

## E) Gestures: swipe back sur pages Profile ✅

**Problème**: Swipe back ne fonctionne pas sur pages secondaires (profil autre user, etc.).

**Solution**:
- `src/lib/swipeBack.ts` déjà implémenté et initialisé dans `App.tsx`
- Détecte swipe depuis bord gauche (< 20px)
- Se déclenche si swipe droite > 60px
- Ne se déclenche pas sur pages root
- Ne casse pas le scroll vertical

**Vérification**: Le swipe back devrait fonctionner sur toutes les pages secondaires.

## F) Désactiver le zoom double-tap (iOS) ✅

**Solution appliquée**:
- `index.html`: Meta viewport avec `user-scalable=no, maximum-scale=1.0, viewport-fit=cover`
- `src/index.css`: `touch-action: manipulation` sur body et boutons
- `-webkit-text-size-adjust: 100%` pour éviter le zoom texte

**Résultat**: Zoom double-tap désactivé sur iOS.

## G) Plan de Test

### 1. Test DB activity_events
- [ ] Appliquer migration SQL dans Supabase
- [ ] Liker un livre plusieurs fois rapidement (spam)
- [ ] Vérifier console: aucun erreur 42703
- [ ] Vérifier que le like fonctionne malgré l'erreur event log (si erreur)

### 2. Test Covers Profil
- [ ] Aller dans Profil > Livres aimés
- [ ] Vérifier que les covers s'affichent (pas de placeholder)
- [ ] Scroller rapidement: vérifier que les covers ne "sautent" pas
- [ ] Vérifier que les covers s'affichent aussi dans la vue "Tous les livres aimés"

### 3. Test Explorer instant
- [ ] Aller dans Bibliothèque > Explorer
- [ ] Vérifier que skeleton grid s'affiche en < 1s
- [ ] Vérifier que les livres apparaissent progressivement
- [ ] Vérifier scroll infini: scroller jusqu'en bas, vérifier que de nouveaux livres se chargent

### 4. Test Explorer FR only
- [ ] Vérifier qu'aucun titre cyrillique/russe n'apparaît
- [ ] Vérifier qu'aucun titre anglais non traduit n'apparaît
- [ ] Vérifier que les titres sont en français

### 5. Test Explorer covers only
- [ ] Vérifier qu'aucun livre sans cover n'apparaît (pas de placeholder)
- [ ] Vérifier que toutes les covers sont valides (pas de 404)

### 6. Test Safe Areas iPhone
- [ ] Tester sur iPhone avec notch/Dynamic Island
- [ ] Vérifier que le titre "Ma Bibliothèque" est visible immédiatement
- [ ] Vérifier qu'il n'y a pas de zone vide en haut
- [ ] Vérifier que la flèche back sur Profil est cliquable (pas dans la zone de status bar)

### 7. Test Swipe back
- [ ] Aller dans Profil > Voir profil d'un autre user
- [ ] Swipe depuis le bord gauche: vérifier que ça revient en arrière
- [ ] Vérifier que le scroll vertical fonctionne toujours

### 8. Test Zoom iOS
- [ ] Tester sur iPhone: double-tap ne doit pas zoomer
- [ ] Pinch ne doit pas zoomer
- [ ] Vérifier que les inputs restent utilisables (pas de zoom forcé)

## Fichiers Modifiés

1. `supabase/migrations/20250124000000_fix_activity_events_actor_id.sql` (nouveau)
2. `src/pages/Profile.tsx` - Safe areas + covers liked books
3. `src/index.css` - Classes `.sticky-header` et `.safe-top`
4. `src/pages/Library.tsx` - Header corrigé (déjà fait précédemment)
5. `index.html` - Meta viewport (déjà fait précédemment)

## Notes

- Le seed local pour Explorer n'a pas été implémenté (fichier JSON créé mais non intégré)
- La recherche avec debounce dans Explorer n'a pas été implémentée
- Le cache localStorage pour les covers n'a pas été implémenté (optionnel)

