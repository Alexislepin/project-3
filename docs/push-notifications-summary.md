# Push Notifications System - Résumé de l'Implémentation

## ✅ Fichiers Créés

### 1. Migration SQL
- **`supabase/migrations/20250126000000_push_notifications_system.sql`**
  - Tables : `notifications`, `user_devices`, `notification_deliveries`
  - Colonnes `user_profiles` : `push_enabled_social`, `push_enabled_reminders`, `reading_preference_window`, `daily_goal_minutes`, `timezone`, `books_goal_per_month`
  - RLS policies complètes
  - Triggers pour notifications sociales (like/comment/follow)

### 2. Edge Functions
- **`supabase/functions/send_push/index.ts`**
  - Envoie des push via APNs
  - Génère JWT token pour authentification APNs
  - Gère les erreurs et retry

- **`supabase/functions/cron_reminders/index.ts`**
  - Fonction cron pour rappels quotidiens
  - Timezone-aware
  - Vérifie si objectif atteint avant d'envoyer
  - Prévention des doublons

### 3. Code React/Capacitor
- **`src/lib/pushNotifications.ts`**
  - Service pour gérer les push iOS
  - Enregistrement device token
  - Listeners pour notifications reçues
  - Deep linking

- **`src/hooks/usePushNotifications.ts`**
  - Hook React pour intégration facile
  - Gestion d'état (registered, token, error)

- **`src/pages/Notifications.tsx`**
  - Page complète pour onglet Notifications
  - Liste paginée
  - Read/unread
  - Navigation vers contenu lié

### 4. Documentation
- **`docs/push-notifications-setup.md`**
  - Guide complet de configuration
  - Étapes Apple Developer
  - Configuration Supabase
  - Tests et dépannage

---

## 🔧 Configuration Requise

### Secrets Supabase
```
APNS_KEY_ID=ABC123XYZ
APNS_TEAM_ID=DEF456UVW
APNS_BUNDLE_ID=com.alexis.lexu
APNS_KEY=[base64 encoded .p8 file]
```

### Dépendances NPM
```bash
npm install @capacitor/push-notifications
npx cap sync ios
```

---

## 📱 Flux Utilisateur

### 1. Inscription Push
1. User se connecte
2. App demande permission push iOS
3. Device token enregistré dans `user_devices`
4. Token utilisé pour envoyer des push

### 2. Notification Sociale
1. User A like/comment/follow User B
2. Trigger SQL crée notification dans `notifications`
3. Edge Function envoie push à User B (si activé)
4. User B voit notification dans l'app

### 3. Rappel Quotidien
1. Cron s'exécute toutes les 15 min
2. Vérifie timezone + `reading_preference_window`
3. Si heure cible (±5 min) → vérifie objectif
4. Si objectif non atteint → envoie push
5. Enregistre dans `notification_deliveries` (évite doublons)

---

## 🎯 Prochaines Étapes

1. **Tester sur iPhone réel**
   - Enregistrer device token
   - Tester notification sociale
   - Tester rappel quotidien

2. **Configurer le cron**
   - Option 1 : pg_cron dans Supabase
   - Option 2 : Cron externe (GitHub Actions, etc.)

3. **Intégrer dans l'onboarding**
   - Ajouter champs `daily_goal_minutes`, `reading_preference_window`, `timezone`

4. **Ajouter route Notifications**
   - Dans `App.tsx`, ajouter `/notifications`

5. **Améliorer JWT signing** (si nécessaire)
   - La fonction `generateAPNsToken()` peut nécessiter une bibliothèque JWT dédiée
   - Alternative : utiliser `https://deno.land/x/djwt@v2.8` avec support ES256

---

## ⚠️ Notes Importantes

### JWT Signing pour APNs
La fonction `generateAPNsToken()` utilise Web Crypto API pour signer avec ES256. 
**Si vous rencontrez des erreurs** :
- Vérifiez que le format du .p8 est correct (PKCS#8)
- Considérez utiliser une bibliothèque JWT dédiée comme `djwt`
- Vérifiez que la signature est au format r||s (pas DER)

### Rate Limiting
Les triggers SQL créent des notifications immédiatement. Pour éviter le spam :
- Les triggers vérifient que l'utilisateur ne like/comment pas sa propre activité
- Les rappels sont limités à 1 par jour via `notification_deliveries`

### Timezone Handling
Le cron utilise `Intl.DateTimeFormat` pour convertir les timezones. 
**Assurez-vous** que les timezones stockées sont au format IANA (ex: `Europe/Paris`).

---

## 📊 Structure des Données

### Notification Types
- `like` : Quelqu'un a aimé une activité
- `comment` : Quelqu'un a commenté une activité
- `follow` : Quelqu'un s'est abonné
- `reminder` : Rappel d'objectif quotidien
- `goal_achieved` : Objectif atteint (futur)
- `streak` : Streak maintenu (futur)

### Reading Preference Windows
- `morning` : Rappel à 10:00
- `lunch` : Rappel à 13:00
- `evening` : Rappel à 20:00

---

## 🐛 Dépannage Rapide

| Problème | Solution |
|----------|----------|
| "Missing APNs configuration" | Vérifier secrets Supabase |
| "Invalid device token" | Réenregistrer device (déconnexion/reconnexion) |
| Push non reçues | Vérifier permissions iOS, device token, certificat .p8 |
| Cron ne s'exécute pas | Vérifier pg_cron activé, tester manuellement |

---

**Dernière mise à jour** : 2025-01-26

