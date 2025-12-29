# Push Notifications - Quick Start

Guide rapide pour activer les notifications push dans Lexu.

## 🚀 Étapes Rapides

### 1. Exécuter la migration SQL
```sql
-- Dans Supabase Dashboard → SQL Editor
-- Exécutez: supabase/migrations/20250126000000_push_notifications_system.sql
```

### 2. Configurer les secrets Supabase
```
Settings → Edge Functions → Secrets
```
Ajoutez :
- `APNS_KEY_ID`
- `APNS_TEAM_ID`
- `APNS_BUNDLE_ID`
- `APNS_KEY` (base64 du .p8)

### 3. Déployer les Edge Functions
```bash
supabase functions deploy send_push
supabase functions deploy cron_reminders
```

### 4. Installer la dépendance
```bash
npm install @capacitor/push-notifications
npx cap sync ios
```

### 5. Intégrer dans App.tsx
```typescript
import { usePushNotifications } from './hooks/usePushNotifications';

function App() {
  const { user } = useAuth();
  const { register } = usePushNotifications();

  useEffect(() => {
    if (user) {
      register();
    }
  }, [user, register]);
  
  // ... reste
}
```

### 6. Ajouter la route Notifications
```typescript
import { Notifications } from './pages/Notifications';

// Dans votre router
<Route path="/notifications" element={<Notifications />} />
```

### 7. Configurer le cron (optionnel)
Voir `docs/push-notifications-setup.md` section "Configuration du Cron Job"

---

## ✅ Checklist

- [ ] Migration SQL exécutée
- [ ] Secrets Supabase configurés
- [ ] Edge Functions déployées
- [ ] `@capacitor/push-notifications` installé
- [ ] Hook `usePushNotifications` intégré
- [ ] Route `/notifications` ajoutée
- [ ] Testé sur iPhone réel

---

**Pour plus de détails** : Voir `docs/push-notifications-setup.md`

