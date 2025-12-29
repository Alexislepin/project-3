# Push Notifications iOS - Guide Complet de Configuration

Ce guide vous explique comment configurer et déployer le système de notifications push iOS pour Lexu.

---

## 📋 Table des Matières

1. [Vue d'ensemble](#vue-densemble)
2. [Prérequis](#prérequis)
3. [Configuration Apple Developer](#configuration-apple-developer)
4. [Configuration Supabase](#configuration-supabase)
5. [Déploiement des Edge Functions](#déploiement-des-edge-functions)
6. [Configuration du Cron Job](#configuration-du-cron-job)
7. [Intégration dans l'App](#intégration-dans-lapp)
8. [Tests](#tests)
9. [Dépannage](#dépannage)

---

## Vue d'ensemble

Le système de notifications push comprend :

- **Notifications sociales** : Like, comment, follow (temps réel via triggers SQL)
- **Rappels quotidiens** : Personnalisés selon `reading_preference_window` et timezone
- **Onglet Notifications** : Historique in-app avec read/unread

**Architecture :**
```
iOS App (Capacitor)
    ↓
Supabase Edge Functions (send_push)
    ↓
Apple Push Notification Service (APNs)
    ↓
Device iOS
```

---

## Prérequis

- ✅ Compte Apple Developer (payant, $99/an)
- ✅ App ID configuré dans Apple Developer Portal
- ✅ Certificat de push (.p8) généré
- ✅ Supabase project avec Edge Functions activées
- ✅ Capacitor iOS configuré dans le projet

---

## Configuration Apple Developer

### 1. Créer une Push Notification Key (.p8)

1. Allez sur [Apple Developer Portal](https://developer.apple.com/account/resources/authkeys/list)
2. Cliquez sur **"+"** pour créer une nouvelle key
3. Donnez un nom (ex: "Lexu Push Key")
4. Cochez **"Apple Push Notifications service (APNs)"**
5. Cliquez **"Continue"** puis **"Register"**
6. **IMPORTANT** : Téléchargez le fichier `.p8` (vous ne pourrez le télécharger qu'une seule fois !)
7. Notez le **Key ID** (ex: `ABC123XYZ`)
8. Notez votre **Team ID** (ex: `DEF456UVW`) - visible dans le coin supérieur droit

### 2. Configurer l'App ID

1. Allez sur [App IDs](https://developer.apple.com/account/resources/identifiers/list/appIds)
2. Sélectionnez votre App ID (ex: `com.alexis.lexu`)
3. Vérifiez que **"Push Notifications"** est activé
4. Si non, activez-le et sauvegardez

### 3. Informations à noter

Vous aurez besoin de :
- **Key ID** : `ABC123XYZ` (exemple)
- **Team ID** : `DEF456UVW` (exemple)
- **Bundle ID** : `com.alexis.lexu` (votre app ID)
- **Fichier .p8** : Le fichier téléchargé (à convertir en base64)

---

## Configuration Supabase

### 1. Convertir le fichier .p8 en base64

```bash
# Sur macOS/Linux
base64 -i AuthKey_ABC123XYZ.p8 -o apns_key_base64.txt

# Ou en une ligne
cat AuthKey_ABC123XYZ.p8 | base64 | pbcopy
```

**⚠️ IMPORTANT** : Le contenu base64 doit inclure les en-têtes PEM :
```
-----BEGIN PRIVATE KEY-----
[contenu base64]
-----END PRIVATE KEY-----
```

### 2. Ajouter les secrets Supabase

Dans votre projet Supabase :

1. Allez sur **Settings** → **Edge Functions** → **Secrets**
2. Ajoutez les secrets suivants :

| Secret Name | Value | Exemple |
|------------|-------|---------|
| `APNS_KEY_ID` | Votre Key ID | `ABC123XYZ` |
| `APNS_TEAM_ID` | Votre Team ID | `DEF456UVW` |
| `APNS_BUNDLE_ID` | Votre Bundle ID | `com.alexis.lexu` |
| `APNS_KEY` | Contenu base64 du .p8 | `LS0tLS1CRUdJTi...` |

**Note** : Pour `APNS_KEY`, collez le contenu base64 complet (avec les en-têtes PEM).

### 3. Exécuter la migration SQL

```bash
# Via Supabase Dashboard → SQL Editor
# Ou via CLI
supabase db push
```

Exécutez le fichier :
```
supabase/migrations/20250126000000_push_notifications_system.sql
```

---

## Déploiement des Edge Functions

### 1. Installer Supabase CLI (si pas déjà fait)

```bash
npm install -g supabase
```

### 2. Se connecter à Supabase

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
```

### 3. Déployer les fonctions

```bash
# Déployer send_push
supabase functions deploy send_push

# Déployer cron_reminders
supabase functions deploy cron_reminders
```

### 4. Vérifier le déploiement

Dans Supabase Dashboard → **Edge Functions**, vous devriez voir :
- ✅ `send_push`
- ✅ `cron_reminders`

---

## Configuration du Cron Job

### Option 1 : Supabase Cron (Recommandé)

Si votre projet Supabase a pg_cron activé :

```sql
-- Créer un cron job qui s'exécute toutes les 15 minutes
SELECT cron.schedule(
  'send-daily-reminders',
  '*/15 * * * *', -- Toutes les 15 minutes
  $$
  SELECT
    net.http_post(
      url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/cron_reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $$
);
```

**⚠️ Remplacez** :
- `YOUR_PROJECT_REF` : Votre project reference
- `YOUR_SERVICE_ROLE_KEY` : Votre service role key (Settings → API)

### Option 2 : Cron Externe (GitHub Actions, Vercel Cron, etc.)

Créez un cron job externe qui appelle l'Edge Function toutes les 15 minutes :

```yaml
# .github/workflows/cron-reminders.yml
name: Daily Reminders Cron

on:
  schedule:
    - cron: '*/15 * * * *' # Toutes les 15 minutes

jobs:
  send-reminders:
    runs-on: ubuntu-latest
    steps:
      - name: Call Supabase Edge Function
        run: |
          curl -X POST \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}" \
            https://YOUR_PROJECT_REF.supabase.co/functions/v1/cron_reminders
```

### Option 3 : Test Manuel

Pour tester manuellement :

```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  https://YOUR_PROJECT_REF.supabase.co/functions/v1/cron_reminders
```

---

## Intégration dans l'App

### 1. Installer les dépendances Capacitor

```bash
npm install @capacitor/push-notifications
npx cap sync ios
```

### 2. Configurer Capacitor iOS

Dans `ios/App/App/Info.plist`, ajoutez (si pas déjà présent) :

```xml
<key>UIBackgroundModes</key>
<array>
  <string>remote-notification</string>
</array>
```

### 3. Initialiser les push dans l'App

Dans `src/App.tsx` ou votre composant racine :

```typescript
import { usePushNotifications } from './hooks/usePushNotifications';
import { useEffect } from 'react';

function App() {
  const { user } = useAuth();
  const { register } = usePushNotifications();

  useEffect(() => {
    if (user) {
      // Enregistrer pour les push après connexion
      register();
    }
  }, [user, register]);

  // ... reste du code
}
```

### 4. Ajouter la route Notifications

Dans `src/App.tsx`, ajoutez la route :

```typescript
import { Notifications } from './pages/Notifications';

// Dans votre router
<Route path="/notifications" element={<Notifications />} />
```

### 5. Mettre à jour l'onboarding

Dans `src/pages/ProfileOnboarding.tsx`, ajoutez les champs :

```typescript
// Dans le state
const [dailyGoalMinutes, setDailyGoalMinutes] = useState(20);
const [readingPreferenceWindow, setReadingPreferenceWindow] = useState<'morning' | 'lunch' | 'evening'>('evening');
const [timezone, setTimezone] = useState('UTC');

// Dans handleSave
await supabase
  .from('user_profiles')
  .update({
    daily_goal_minutes: dailyGoalMinutes,
    reading_preference_window: readingPreferenceWindow,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, // Auto-detect
  })
  .eq('id', user.id);
```

---

## Tests

### 1. Test de l'enregistrement du device token

1. Lancez l'app sur un iPhone réel (pas le simulateur)
2. Connectez-vous
3. Vérifiez dans Supabase Dashboard → `user_devices` :
   - Une ligne avec votre `user_id` et un `device_token`

### 2. Test d'une notification sociale

1. Créez une activité
2. Faites un like/comment depuis un autre compte
3. Vérifiez :
   - Notification créée dans `notifications`
   - Push envoyée (vérifiez les logs Edge Function)

### 3. Test d'un rappel quotidien

1. Configurez votre profil avec :
   - `reading_preference_window` : `'evening'`
   - `push_enabled_reminders` : `true`
   - `daily_goal_minutes` : `20`
2. Attendez 20:00 (ou modifiez le cron pour tester immédiatement)
3. Vérifiez :
   - Notification créée
   - Push reçue sur l'iPhone

### 4. Test de l'onglet Notifications

1. Ouvrez `/notifications` dans l'app
2. Vérifiez :
   - Liste des notifications
   - Read/unread fonctionne
   - Navigation vers les activités/profils

---

## Dépannage

### Erreur : "Missing APNs configuration"

**Cause** : Les secrets Supabase ne sont pas configurés.

**Solution** :
1. Vérifiez que tous les secrets sont présents (Settings → Edge Functions → Secrets)
2. Redéployez l'Edge Function : `supabase functions deploy send_push`

### Erreur : "Invalid device token"

**Cause** : Le token APNs est invalide ou expiré.

**Solution** :
1. Vérifiez que l'app est bien installée sur un iPhone réel (pas simulateur)
2. Réenregistrez le device : déconnectez/reconnectez l'utilisateur

### Les push ne sont pas reçues

**Checklist** :
1. ✅ Permissions push accordées dans iOS Settings
2. ✅ Device token enregistré dans `user_devices`
3. ✅ `push_enabled_social` ou `push_enabled_reminders` = `true`
4. ✅ App en production (pas sandbox APNs)
5. ✅ Certificat .p8 valide et non expiré

### Le cron ne s'exécute pas

**Solution** :
1. Vérifiez que pg_cron est activé dans Supabase
2. Testez manuellement l'Edge Function
3. Vérifiez les logs Edge Function dans Supabase Dashboard

### Erreur JWT signing

**Cause** : Le format du .p8 en base64 est incorrect.

**Solution** :
1. Vérifiez que le secret `APNS_KEY` inclut les en-têtes PEM
2. Réencodez le fichier .p8 en base64

---

## Structure des Données

### Table `notifications`

```sql
SELECT * FROM notifications WHERE user_id = '...' ORDER BY created_at DESC;
```

### Table `user_devices`

```sql
SELECT * FROM user_devices WHERE user_id = '...';
```

### Table `notification_deliveries`

```sql
SELECT * FROM notification_deliveries 
WHERE user_id = '...' 
AND notification_type = 'reminder'
AND date_key = CURRENT_DATE;
```

---

## Sécurité

- ✅ RLS activé sur toutes les tables
- ✅ Service role key utilisé uniquement dans Edge Functions
- ✅ Device tokens stockés de manière sécurisée
- ✅ Rate limiting sur les triggers (pas de spam)

---

## Support

Pour toute question ou problème :
1. Vérifiez les logs Edge Functions dans Supabase Dashboard
2. Vérifiez les logs iOS dans Xcode Console
3. Consultez la [documentation APNs](https://developer.apple.com/documentation/usernotifications)

---

**Dernière mise à jour** : 2025-01-26

