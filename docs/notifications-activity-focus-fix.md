# Correction du focus sur l'activité dans "Mes activités"

## Date: 2025-01-XX

## Problème identifié

Les notifications LIKE/COMMENT ouvraient le profil mais ne focusaient pas l'activité exacte dans le modal "Mes activités". Le clic sur une notification devait :
1. Ouvrir MON profil
2. Ouvrir automatiquement le modal "Mes activités"
3. Scroller vers l'activité concernée
4. Highlight la carte
5. Ouvrir CommentModal si notif=comment

## Solution implémentée

### 1. Type ActivityFocus (navigation payload unique)

**Fichier:** `src/lib/activityFocus.ts` (nouveau)

```typescript
export type ActivityFocus = {
  ownerUserId: string;         // user.id (moi)
  activityId: string;
  commentId?: string | null;
  openComments?: boolean;      // true si notif comment
  openMyActivities?: boolean;  // true pour ouvrir le modal "Mes activités"
  source?: 'notification';
};
```

### 2. NotificationsModal - Passage du type de notification

**Fichier:** `src/components/NotificationsModal.tsx`

**Changements:**
- ✅ Ajout du paramètre `notifType` à `onOpenMyActivity`
- ✅ Correction du nesting DOM : `<button>` remplacé par `<div role="button">` pour éviter button dans button
- ✅ Passage du type (`'like'` ou `'comment'`) pour déterminer si on ouvre les commentaires

**Code clé:**
```typescript
onOpenMyActivity?: (activityId: string, commentId?: string | null, notifType?: 'like' | 'comment') => void;

// Dans handleNotificationClick
case 'like':
case 'reaction':
  onOpenMyActivity(notif.activity.id, null, 'like');
  break;
case 'comment':
  onOpenMyActivity(notif.activity.id, commentId, 'comment');
  break;
```

### 3. Home.tsx - Création du payload ActivityFocus

**Fichier:** `src/pages/Home.tsx`

**Changements:**
- ✅ Remplacement de `profileFocusActivityId` et `profileFocusCommentId` par `activityFocus: ActivityFocus | null`
- ✅ Création du payload avec toutes les infos nécessaires
- ✅ Passage à `UserProfileView` via prop `activityFocus`

**Code clé:**
```typescript
const [activityFocus, setActivityFocus] = useState<ActivityFocus | null>(null);

onOpenMyActivity={(activityId, commentId, notifType) => {
  setShowNotifications(false);
  setSelectedUserId(user?.id || null);
  setActivityFocus({
    ownerUserId: user?.id || '',
    activityId,
    commentId: commentId ?? null,
    openComments: notifType === 'comment',
    openMyActivities: true,
    source: 'notification',
  });
}}

<UserProfileView
  activityFocus={activityFocus}
  onFocusConsumed={() => setActivityFocus(null)}
/>
```

### 4. UserProfileView - Ouverture automatique du modal

**Fichier:** `src/components/UserProfileView.tsx`

**Changements:**
- ✅ Remplacement de `initialFocusActivityId` et `initialFocusCommentId` par `activityFocus: ActivityFocus | null`
- ✅ `useEffect` pour ouvrir automatiquement `showUserActivities` si `activityFocus.openMyActivities` et `activityFocus.ownerUserId === userId`
- ✅ Passage des props à `MyActivities` : `focusActivityId`, `focusCommentId`, `autoOpenComments`, `onFocusConsumed`

**Code clé:**
```typescript
interface UserProfileViewProps {
  activityFocus?: ActivityFocus | null;
  onFocusConsumed?: () => void;
}

// Ouvrir automatiquement "Mes activités" si activityFocus.openMyActivities
useEffect(() => {
  if (activityFocus?.openMyActivities && activityFocus.ownerUserId === userId && !loading && profile) {
    setShowUserActivities(true);
  }
}, [activityFocus, userId, loading, profile]);

// Dans le render
if (showUserActivities) {
  return (
    <MyActivities
      focusActivityId={activityFocus?.activityId || null}
      focusCommentId={activityFocus?.commentId || null}
      autoOpenComments={activityFocus?.openComments || false}
      onFocusConsumed={onFocusConsumed}
      ...
    />
  );
}
```

### 5. MyActivities - Focus, scroll, highlight, CommentModal

**Fichier:** `src/pages/MyActivities.tsx`

**Changements:**
- ✅ Remplacement de `initialFocusActivityId` par `focusActivityId`, `focusCommentId`, `autoOpenComments`, `onFocusConsumed`
- ✅ Ajout d'IDs stables sur chaque carte : `id={`my-activity-${activity.id}`}`
- ✅ State `highlightedActivityId` pour le highlight visuel
- ✅ State `focusConsumed` pour éviter les re-runs
- ✅ Deux `useEffect` :
  1. Charger l'activité ciblée si elle n'est pas dans la liste (fetch ciblé)
  2. Scroll + highlight + ouvrir CommentModal après chargement
- ✅ Highlight UI : `ring-2 ring-primary/40 bg-neutral-50` pendant 1.5s

**Code clé:**
```typescript
interface MyActivitiesProps {
  focusActivityId?: string | null;
  focusCommentId?: string | null;
  autoOpenComments?: boolean;
  onFocusConsumed?: () => void;
}

// Charger l'activité si elle n'est pas dans la liste
useEffect(() => {
  if (focusActivityId && activities.length > 0 && !loading && !focusConsumed && userId) {
    const activityExists = activities.some(a => a.id === focusActivityId);
    if (!activityExists) {
      // Fetch ciblé par activityId
      loadTargetActivity();
    }
  }
}, [focusActivityId, activities.length, loading, focusConsumed, userId]);

// Focus après chargement
useEffect(() => {
  if (focusActivityId && activities.length > 0 && !loading && !focusConsumed) {
    const timer = setTimeout(() => {
      const element = document.getElementById(`my-activity-${focusActivityId}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setHighlightedActivityId(focusActivityId);
        setTimeout(() => setHighlightedActivityId(null), 1500);
        if (autoOpenComments) {
          setCommentingActivityId(focusActivityId);
        }
        setTimeout(() => {
          setFocusConsumed(true);
          onFocusConsumed?.();
        }, 500);
      }
    }, 300);
    return () => clearTimeout(timer);
  }
}, [focusActivityId, activities.length, loading, autoOpenComments, focusConsumed, onFocusConsumed]);

// Render avec highlight
<div 
  id={`my-activity-${activity.id}`}
  data-activity-id={activity.id}
  className={`transition-all duration-300 ${
    highlightedActivityId === activity.id
      ? 'ring-2 ring-primary/40 bg-neutral-50 rounded-xl p-1'
      : ''
  }`}
>
  <ActivityCard ... />
</div>
```

### 6. Profile.tsx - Intégration

**Fichier:** `src/pages/Profile.tsx`

**Changements:**
- ✅ Remplacement de `profileFocusActivityId` et `profileFocusCommentId` par `activityFocus`
- ✅ Création du payload dans `onOpenMyActivity`
- ✅ Passage à `UserProfileView`

### 7. Correction du nesting DOM

**Fichier:** `src/components/NotificationsModal.tsx`

**Changements:**
- ✅ Remplacement de `<button>` par `<div role="button" tabIndex={0}>` pour la row principale
- ✅ Les boutons internes (avatar, follow) restent des `<button>` avec `stopPropagation()`

**Code clé:**
```typescript
// Avant (❌ button dans button)
<button onClick={onClick}>
  <button onClick={onUserClick}>...</button>
</button>

// Après (✅ div role="button")
<div role="button" tabIndex={0} onClick={onClick} onKeyDown={...}>
  <button onClick={(e) => { e.stopPropagation(); onUserClick?.(); }}>
    ...
  </button>
</div>
```

## Flux de navigation

### Notification LIKE
1. Clic sur notification → `handleNotificationClick`
2. Marquage comme lu (optimiste + DB)
3. Fermeture du modal
4. `onOpenMyActivity(activityId, null, 'like')`
5. `Home.tsx` crée `ActivityFocus` avec `openMyActivities: true`, `openComments: false`
6. `UserProfileView` s'ouvre avec `activityFocus`
7. `useEffect` détecte `activityFocus.openMyActivities` → `setShowUserActivities(true)`
8. `MyActivities` se monte avec `focusActivityId`
9. `useEffect` scroll vers `my-activity-${focusActivityId}`
10. Highlight pendant 1.5s
11. `onFocusConsumed()` → reset `activityFocus` dans `Home.tsx`

### Notification COMMENT
1-7. Identique à LIKE
8. `MyActivities` se monte avec `focusActivityId`, `focusCommentId`, `autoOpenComments: true`
9. Scroll + highlight
10. `CommentModal` s'ouvre automatiquement avec `activityId` et `initialFocusCommentId`
11. `onFocusConsumed()` → reset

### Notification FOLLOW
1. Clic sur notification → `handleNotificationClick`
2. Marquage comme lu
3. Fermeture du modal
4. `onUserClick(actor_id)` → ouvre le profil de l'utilisateur qui a suivi

## Garanties

✅ **L'activité est toujours dans la liste:**
- Si elle n'est pas dans les 50 premiers résultats, fetch ciblé par `activityId`
- L'activité est ajoutée en haut de la liste
- Le scroll fonctionne toujours

✅ **Pas de re-trigger:**
- `focusConsumed` empêche les re-runs
- `onFocusConsumed()` reset le focus après consommation
- Le focus est consommé après 500ms (après scroll + highlight)

✅ **Pas de nesting DOM:**
- Row principale = `<div role="button">`
- Boutons internes = `<button>` avec `stopPropagation()`

## Plan de test iPhone

### Test 1: Notification LIKE
1. ✅ Créer une activité de lecture
2. ✅ Demander à un autre utilisateur de liker cette activité
3. ✅ Ouvrir le modal notifications
4. ✅ Cliquer sur "X a aimé votre lecture"
5. **Résultat attendu:**
   - Modal notifications se ferme
   - MON profil s'ouvre
   - Modal "Mes activités" s'ouvre automatiquement
   - Scroll vers l'activité concernée
   - Highlight (ring + bg) pendant 1.5s
   - Pas de CommentModal ouvert

### Test 2: Notification COMMENT
1. ✅ Créer une activité de lecture
2. ✅ Demander à un autre utilisateur de commenter cette activité
3. ✅ Ouvrir le modal notifications
4. ✅ Cliquer sur "X a commenté votre lecture"
5. **Résultat attendu:**
   - Modal notifications se ferme
   - MON profil s'ouvre
   - Modal "Mes activités" s'ouvre automatiquement
   - Scroll vers l'activité concernée
   - Highlight pendant 1.5s
   - CommentModal s'ouvre automatiquement
   - (Optionnel) Scroll vers le commentaire spécifique dans CommentModal

### Test 3: Activité hors des 50 premiers
1. ✅ Créer plus de 50 activités
2. ✅ Demander à un autre utilisateur de liker une activité ancienne (hors des 50 premiers)
3. ✅ Cliquer sur la notification
4. **Résultat attendu:**
   - L'activité est chargée séparément
   - Elle apparaît en haut de la liste
   - Scroll + highlight fonctionnent

### Test 4: Notification FOLLOW
1. ✅ Demander à un autre utilisateur de vous suivre
2. ✅ Cliquer sur la notification
3. **Résultat attendu:**
   - Profil de l'utilisateur qui a suivi s'ouvre
   - Pas de modal "Mes activités"
   - Pas de focus sur activité

### Test 5: Marquage comme lu
1. ✅ Ouvrir le modal notifications
2. ✅ Vérifier qu'une notification unread a un fond neutre + dot
3. ✅ Cliquer sur la notification
4. **Résultat attendu:**
   - Le fond neutre disparaît immédiatement
   - Le dot disparaît
   - La notification est marquée comme lue en base

## Fichiers modifiés

1. ✅ `src/lib/activityFocus.ts` (nouveau) - Type ActivityFocus
2. ✅ `src/components/NotificationsModal.tsx` - Handler + nesting DOM
3. ✅ `src/pages/Home.tsx` - Création ActivityFocus
4. ✅ `src/components/UserProfileView.tsx` - Ouverture auto modal + props
5. ✅ `src/pages/MyActivities.tsx` - Focus, scroll, highlight, fetch ciblé
6. ✅ `src/components/CommentModal.tsx` - Prop initialFocusCommentId
7. ✅ `src/pages/Profile.tsx` - Intégration ActivityFocus

## TODOs

1. **Scroll vers commentaire dans CommentModal:**
   - Ajouter un ID sur chaque commentaire : `<div id={`comment-${comment.id}`}>`
   - Implémenter le scroll vers `initialFocusCommentId` après chargement des commentaires

2. **Améliorer le fetch ciblé:**
   - Actuellement, l'activité est ajoutée en haut de la liste
   - Option: Insérer à la position chronologique correcte

## Notes techniques

- Le payload `ActivityFocus` est unique et contient toutes les infos nécessaires
- Le focus est consommé après 500ms pour éviter les re-triggers
- Le highlight utilise `ring-2 ring-primary/40 bg-neutral-50` avec transition
- Le scroll utilise `scrollIntoView({ behavior: 'smooth', block: 'center' })`
- Les IDs sont stables : `my-activity-${activity.id}`
- Le nesting DOM est corrigé : `<div role="button">` au lieu de `<button>` pour la row

