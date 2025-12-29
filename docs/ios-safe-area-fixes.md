# Corrections iOS Safe Area + Permissions

## 📋 Résumé des corrections

### 1. ✅ Safe Area Global
- **Fichier créé** : `src/components/ui/SafeAreaContainer.tsx`
- **CSS mis à jour** : `src/index.css` - Classes `.safe-area-top` et `.safe-area-bottom` avec padding minimal
- **Variables CSS** : `--sat`, `--sab` pour safe-area-inset-top/bottom

### 2. ✅ Onboarding (ProfileOnboarding.tsx)
- **Header** : Ajout de `safe-area-top` sur le header "Étape X sur 3"
- **CTA Bottom** : Ajout de `safe-area-bottom` sur le footer avec bouton "Suivant/Terminer"
- Le header est maintenant sous le notch/Dynamic Island
- Le bouton est au-dessus du home indicator

### 3. ✅ Scanner (BarcodeScanner.tsx)
- **Texte bottom** : Ajout de `safe-area-bottom` avec padding minimal sur le texte "Placez le code-barres..."
- Le texte est maintenant visible au-dessus du home indicator

### 4. ✅ Bibliothèque (Library.tsx)
- **Alignement vertical** : La liste utilise `space-y-3 pt-0` pour coller en haut
- **Condition** : Empty state centré uniquement quand `userBooks.length === 0`
- Quand il y a 1 livre ou plus, la liste est alignée en haut

### 5. ✅ Photo de profil (EditProfileModal.tsx + ProfileOnboarding.tsx)
- **Capacitor Camera** : Intégration complète avec gestion des permissions
- **Boutons Caméra/Galerie** : Fonctionnels avec handlers robustes
- **Gestion erreurs** :
  - Vérification permissions avant accès
  - Messages d'erreur clairs si permission refusée
  - Fallback galerie si caméra indisponible (simulateur)
  - Upload vers Supabase Storage
- **Info.plist** : Permissions ajoutées/mises à jour

## 📁 Fichiers modifiés

### Nouveaux fichiers
- `src/components/ui/SafeAreaContainer.tsx` - Composant wrapper safe-area
- `src/lib/recapUI.ts` - Types pour RecapUI (déjà créé précédemment)

### Fichiers modifiés
1. `src/index.css` - Classes safe-area avec padding minimal
2. `src/pages/ProfileOnboarding.tsx` - Safe-area header/footer + amélioration caméra/galerie
3. `src/components/BarcodeScanner.tsx` - Safe-area bottom
4. `src/pages/Library.tsx` - Alignement vertical liste
5. `src/components/EditProfileModal.tsx` - Intégration Capacitor Camera + permissions
6. `ios/App/App/Info.plist` - Permissions caméra/galerie mises à jour

## 🔧 Instructions de build iOS

### 1. Synchroniser Capacitor après modification Info.plist

```bash
npx cap sync ios
```

### 2. Rebuild l'app iOS

```bash
# Option 1: Via Xcode
open ios/App/App.xcworkspace
# Puis Product > Clean Build Folder (Cmd+Shift+K)
# Puis Product > Build (Cmd+B)

# Option 2: Via CLI (si configuré)
cd ios/App
xcodebuild -workspace App.xcworkspace -scheme App -configuration Debug
```

### 3. Vérifier les permissions dans Xcode

1. Ouvrir `ios/App/App.xcworkspace` dans Xcode
2. Sélectionner le projet "App" dans le navigateur
3. Onglet "Info" > "Custom iOS Target Properties"
4. Vérifier que les clés suivantes existent :
   - `NSCameraUsageDescription` : "Nous utilisons la caméra pour scanner le code-barres (ISBN) des livres et prendre une photo de profil."
   - `NSPhotoLibraryUsageDescription` : "Nous accédons à votre photothèque pour choisir une photo de profil ou une image de couverture de livre."
   - `NSPhotoLibraryAddUsageDescription` : "Nous sauvegardons des images dans votre photothèque si vous choisissez de les enregistrer."

### 4. Tester sur iPhone physique (recommandé)

Les safe-area et permissions fonctionnent mieux sur un iPhone physique qu'en simulateur.

## 🧪 Plan de test iPhone

### Prérequis
- iPhone avec notch/Dynamic Island (iPhone 14/15/16)
- App installée en mode Debug ou Release

### Tests à effectuer

#### ✅ Test 1: Onboarding - Header
1. Lancer l'app et créer un compte
2. Vérifier que le header "Étape X sur 3" est **visible** (pas sous le notch)
3. Vérifier que la barre de progression est visible
4. ✅ **Résultat attendu** : Header visible, bien positionné sous le notch

#### ✅ Test 2: Onboarding - CTA Bottom
1. Sur n'importe quelle étape de l'onboarding
2. Scroller jusqu'en bas
3. Vérifier que le bouton "Suivant" ou "Terminer" est **au-dessus du home indicator**
4. Vérifier qu'on peut cliquer dessus sans problème
5. ✅ **Résultat attendu** : Bouton accessible, pas caché par le home indicator

#### ✅ Test 3: Scanner - Texte Bottom
1. Aller dans Bibliothèque
2. Cliquer sur l'icône scanner (code-barres)
3. Vérifier que le texte "Placez le code-barres dans le cadre" est **visible**
4. Vérifier qu'il n'est pas caché par le home indicator
5. ✅ **Résultat attendu** : Texte visible, bien positionné

#### ✅ Test 4: Bibliothèque - Alignement vertical
1. Aller dans Bibliothèque
2. S'assurer d'avoir **exactement 1 livre** dans "En cours" (ajouter/supprimer si nécessaire)
3. Vérifier que la carte du livre est **collée en haut** (pas centrée verticalement)
4. ✅ **Résultat attendu** : Carte alignée en haut, pas au milieu

#### ✅ Test 5: Bibliothèque - Empty state
1. Aller dans Bibliothèque
2. S'assurer d'avoir **0 livre** dans "En cours"
3. Vérifier que le message "Aucun livre" est **centré verticalement**
4. ✅ **Résultat attendu** : Empty state centré (comportement attendu)

#### ✅ Test 6: Photo profil - Caméra
1. Aller dans Profil > Modifier le profil
2. Cliquer sur "Caméra"
3. **Première fois** : Vérifier que la permission est demandée
4. Autoriser la permission
5. Vérifier que l'appareil photo s'ouvre
6. Prendre une photo
7. Vérifier que la photo apparaît dans le preview
8. ✅ **Résultat attendu** : Caméra fonctionne, photo uploadée

#### ✅ Test 7: Photo profil - Galerie
1. Aller dans Profil > Modifier le profil
2. Cliquer sur "Galerie"
3. **Première fois** : Vérifier que la permission est demandée
4. Autoriser la permission
5. Vérifier que la galerie s'ouvre
6. Sélectionner une photo
7. Vérifier que la photo apparaît dans le preview
8. ✅ **Résultat attendu** : Galerie fonctionne, photo uploadée

#### ✅ Test 8: Photo profil - Permission refusée
1. Aller dans Réglages iPhone > Lexu
2. Désactiver l'accès à la Caméra
3. Retourner dans l'app > Profil > Modifier le profil
4. Cliquer sur "Caméra"
5. Vérifier qu'un message d'erreur clair s'affiche : "Permission refusée. Ouvrez les Réglages..."
6. ✅ **Résultat attendu** : Message d'erreur clair, pas de crash

#### ✅ Test 9: Photo profil - Simulateur (fallback)
1. Tester sur simulateur iOS (pas de caméra physique)
2. Cliquer sur "Caméra"
3. Vérifier qu'un message s'affiche : "Caméra indisponible. Utilisation de la galerie..."
4. Vérifier que la galerie s'ouvre automatiquement
5. ✅ **Résultat attendu** : Fallback vers galerie, message informatif

#### ✅ Test 10: Onboarding - Photo profil
1. Créer un nouveau compte
2. Arriver à l'étape "Ajoutez une photo de profil"
3. Tester les boutons "Caméra" et "Galerie"
4. Vérifier que tout fonctionne comme dans Test 6/7
5. ✅ **Résultat attendu** : Même comportement que dans EditProfileModal

## 📝 Notes techniques

### Safe Area CSS
Les classes utilisent `max(12px, env(safe-area-inset-top))` pour garantir un padding minimal même sur les anciens appareils sans notch.

### Capacitor Camera
- Utilise `@capacitor/camera` v5+
- Vérifie les permissions avant d'accéder à la caméra/galerie
- Gère les erreurs de permission avec messages clairs
- Fallback automatique vers galerie si caméra indisponible (simulateur)

### Permissions Info.plist
- `NSCameraUsageDescription` : Requis pour accès caméra
- `NSPhotoLibraryUsageDescription` : Requis pour accès galerie (lecture)
- `NSPhotoLibraryAddUsageDescription` : Requis pour sauvegarder dans la galerie (optionnel, mais recommandé)

## ✅ Checklist finale

- [x] Safe-area CSS global créé
- [x] Onboarding header corrigé
- [x] Onboarding CTA bottom corrigé
- [x] Scanner texte bottom corrigé
- [x] Bibliothèque alignement vertical corrigé
- [x] EditProfileModal caméra/galerie corrigé
- [x] ProfileOnboarding caméra/galerie amélioré
- [x] Info.plist permissions mises à jour
- [x] Gestion erreurs permissions implémentée
- [x] Fallback simulateur implémenté

## 🚀 Prochaines étapes

1. Exécuter `npx cap sync ios`
2. Rebuild l'app dans Xcode
3. Tester sur iPhone physique (iPhone 14/15/16)
4. Vérifier tous les tests du plan de test
5. Corriger les éventuels problèmes restants

