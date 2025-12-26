# Instructions de test iOS - Corrections Lexu

## Fichiers modifiés

1. **Safe Area**
   - `src/pages/Home.tsx` - Ajout de `safe-area-top` class
   - `src/index.css` - Ajout des utilitaires CSS `safe-area-top` et `safe-area-bottom`
   - `src/components/auth/Onboarding.tsx` - Ajout de `safe-area-top` et `safe-area-bottom`

2. **Swipe Back**
   - Capacitor gère automatiquement le swipe back sur iOS (pas de modification nécessaire)

3. **Camera Permission**
   - `ios/App/App/Info.plist` - Ajout de `NSCameraUsageDescription`
   - `src/lib/cameraPermission.ts` - Nouveau fichier pour gérer les permissions caméra
   - `src/components/BarcodeScanner.tsx` - Intégration de la demande de permission + prompt Réglages

4. **Notification Permission**
   - `src/lib/notificationPermission.ts` - Nouveau fichier pour gérer les permissions notifications
   - `src/components/auth/Onboarding.tsx` - Remplacement de `Notification.requestPermission()` par Capacitor LocalNotifications

5. **Onboarding Goals**
   - `src/components/auth/Onboarding.tsx` - Remplacement complet avec 5 nouvelles étapes :
     - Objectif temps (10/20/30/45/60 min/jour)
     - Objectif livres/mois (1/2/3/4+)
     - Moment préféré (matin/midi/soir/variable)
     - Genre principal (roman/non-fiction/business/dev perso/autre)
     - Niveau actuel (je reprends/régulier/gros lecteur)

## Installation des dépendances

**IMPORTANT** : Exécutez ces commandes dans le terminal :

```bash
cd "/Users/alexislepin/Downloads/project 3"
npm install @capacitor/local-notifications @capacitor/camera @capacitor/app
npx cap sync ios
```

## Instructions de test sur iPhone via Xcode

### 1. Ouvrir le projet dans Xcode

```bash
cd "/Users/alexislepin/Downloads/project 3/ios/App"
open App.xcodeproj
```

### 2. Sélectionner un iPhone avec notch (ex: iPhone 14 Pro, iPhone 15)

Dans Xcode :
- En haut à gauche, cliquez sur le sélecteur de device
- Choisissez un iPhone avec notch (iPhone 14 Pro, iPhone 15, etc.)
- Si aucun device n'est disponible, créez un simulateur : `Window > Devices and Simulators > +`

### 3. Build et Run

- Cliquez sur le bouton ▶️ (Play) en haut à gauche
- Ou appuyez sur `Cmd + R`
- Attendez que l'app se lance sur le simulateur/device

### 4. Tests à effectuer

#### ✅ Test 1 : Safe Area (Fil d'actualité)
1. Connectez-vous à l'app
2. Allez sur l'onglet "Accueil" (Fil d'actualité)
3. **Vérifiez** : Le contenu ne passe PAS sous l'heure/notch en haut
4. **Vérifiez** : En scrollant, les marges restent stables

#### ✅ Test 2 : Swipe Back
1. Allez sur l'onglet "Profil"
2. Cliquez sur un utilisateur pour ouvrir son profil
3. **Vérifiez** : Un swipe depuis le bord gauche de l'écran revient à l'écran précédent
4. **Vérifiez** : Le bouton "Retour" (s'il existe) fonctionne toujours

#### ✅ Test 3 : Camera Permission
1. Allez sur l'onglet "Bibliothèque" > "Explorer"
2. Cliquez sur le bouton scanner (icône caméra)
3. **Vérifiez** : Une popup iOS apparaît demandant l'autorisation caméra
4. **Test refus** : Refusez la permission
5. **Vérifiez** : Un message s'affiche avec un bouton "Ouvrir Réglages"
6. **Vérifiez** : Le bouton ouvre bien les Réglages iOS

#### ✅ Test 4 : Notification Permission
1. Déconnectez-vous et reconnectez-vous (ou supprimez l'app et réinstallez)
2. Passez l'onboarding jusqu'à l'étape "Notifications"
3. Cliquez sur "Activer les notifications"
4. **Vérifiez** : Une popup iOS apparaît demandant l'autorisation notifications
5. **Test accept** : Acceptez → **Vérifiez** : "✓ Notifications activées" s'affiche
6. **Test refus** : Refusez → **Vérifiez** : Message + bouton "Ouvrir Réglages" s'affiche

#### ✅ Test 5 : Onboarding Goals
1. Déconnectez-vous et reconnectez-vous (ou supprimez l'app et réinstallez)
2. **Vérifiez** : L'onboarding a 5 étapes :
   - Étape 1 : Objectif temps (10/20/30/45/60 min)
   - Étape 2 : Objectif livres/mois (1/2/3/4+)
   - Étape 3 : Moment préféré (matin/midi/soir/variable)
   - Étape 4 : Genre principal (roman/non-fiction/business/dev perso/autre)
   - Étape 5 : Niveau actuel (je reprends/régulier/gros lecteur)
3. **Vérifiez** : Les boutons "Retour" et "Continuer" fonctionnent
4. **Vérifiez** : Après complétion, les données sont sauvegardées (vérifier dans Supabase `user_profiles.onboarding_goals`)

## Checklist "Done / To verify"

### ✅ Done (Code modifié)
- [x] Safe Area CSS ajouté (`safe-area-top`, `safe-area-bottom`)
- [x] Safe Area appliqué sur Home.tsx et Onboarding.tsx
- [x] Info.plist contient `NSCameraUsageDescription`
- [x] `cameraPermission.ts` créé avec gestion iOS/Web
- [x] `BarcodeScanner.tsx` demande permission avant scan
- [x] `BarcodeScanner.tsx` affiche prompt Réglages si refusé
- [x] `notificationPermission.ts` créé avec Capacitor LocalNotifications
- [x] `Onboarding.tsx` utilise Capacitor pour notifications
- [x] `Onboarding.tsx` remplacé avec 5 nouvelles étapes
- [x] Données onboarding sauvegardées dans `user_profiles.onboarding_goals`

### ⚠️ To Verify (Tests à faire)
- [ ] Safe Area : Contenu ne passe pas sous notch sur iPhone réel
- [ ] Swipe Back : Fonctionne depuis Profile vers Home
- [ ] Camera Permission : Popup iOS apparaît au premier scan
- [ ] Camera Permission : Bouton "Ouvrir Réglages" fonctionne si refusé
- [ ] Notification Permission : Popup iOS apparaît au clic "Activer"
- [ ] Notification Permission : État "granted" affiché correctement
- [ ] Notification Permission : Bouton "Ouvrir Réglages" fonctionne si refusé
- [ ] Onboarding : 5 étapes s'affichent correctement
- [ ] Onboarding : Données sauvegardées dans Supabase après complétion

## Notes importantes

1. **Swipe Back** : Capacitor gère automatiquement le swipe back sur iOS via WKWebView. Aucune configuration supplémentaire nécessaire.

2. **Permissions** : Les plugins Capacitor (`@capacitor/camera`, `@capacitor/local-notifications`) doivent être installés ET synchronisés avec `npx cap sync ios` pour que les permissions fonctionnent.

3. **Info.plist** : Les clés `NSCameraUsageDescription` et `NSPhotoLibraryUsageDescription` sont obligatoires pour iOS. Sans elles, l'app crashra lors de la demande de permission.

4. **Onboarding Goals** : Les données sont stockées dans `user_profiles.onboarding_goals` (JSON) et dans `user_goals` (table séparée pour les objectifs actifs).

## Dépannage

### Les permissions ne fonctionnent pas
- Vérifiez que `npx cap sync ios` a été exécuté après l'installation des plugins
- Vérifiez que les plugins sont bien dans `package.json`
- Rebuild le projet dans Xcode (`Product > Clean Build Folder` puis `Cmd + R`)

### Le swipe back ne fonctionne pas
- Vérifiez que vous testez sur un device/simulateur iOS (pas Android)
- Le swipe back fonctionne uniquement pour les pages "poussées" dans la navigation (pas pour les modals)

### Safe Area ne fonctionne pas
- Vérifiez que vous testez sur un iPhone avec notch (pas un iPhone SE ou ancien modèle)
- Vérifiez que `env(safe-area-inset-top)` est supporté (iOS 11+)

