# Correction du flux de navigation des notifications

## Date: 2025-01-XX

## Problème identifié

Les notifications ouvraient le mauvais endroit :
- Les notifications LIKE/COMMENT ouvraient `CommentModal` dans `Home.tsx`
- Mais `Home.tsx` affiche les activités des gens suivis, pas mes activités
- Résultat : "A aimé votre lecture" ouvrait un commentaire d'un autre post

## Solution implémentée

### 1. NotificationsModal - Handler corrigé

**Fichier:** `src/components/NotificationsModal.tsx`

**Changements:**
- ✅ Remplacement de `onActivityClick` par `onOpenMyActivity`
- ✅ Handler `handleNotificationClick` corrigé :
  - `like` / `reaction` → `onOpenMyActivity(activityId, null)` (ouvre MON profil)
  - `comment` → `onOpenMyActivity(activityId, commentId)` (ouvre MON profil avec focus commentaire)
  - `follow` → `onUserClick(actor_id)` (ouvre le profil de l'utilisateur qui a suivi)
- ✅ Marquage comme lu optimiste + en base
- ✅ Row entièrement cliquable (`<button>` avec `w-full text-left`)
- ✅ Style unread corrigé : `bg-neutral-50 border border-neutral-200` (plus de `border-l-2`)
- ✅ Dot unread sur l'avatar

**Code clé:**
```typescript
const handleNotificationClick = async (notif: Notification) => {
  // Marquage optimiste
  setNotifications((prev) =>
    prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n))
  );
  
  // Update en base
  await supabase.from('notifications').update({ read: true })...
  
  // Fermer modal
  onClose();
  
  // Navigation selon type
  switch (notif.type) {
    case 'like':
    case 'reaction':
      if (notif.activity?.id && onOpenMyActivity) {
        onOpenMyActivity(notif.activity.id, null);
      }
      break;
    case 'comment':
      if (notif.activity?.id && onOpenMyActivity) {
        onOpenMyActivity(notif.activity.id, notif.comment?.id || null);
      }
      break;
    case 'follow':
      if (notif.userId && onUserClick) {
        onUserClick(notif.userId); // actor_id
      }
      break;
  }
};
```

### 2. Home.tsx - Flow profil

**Fichier:** `src/pages/Home.tsx`

**Changements:**
- ✅ Ajout de states : `profileFocusActivityId`, `profileFocusCommentId`
- ✅ Remplacement de `onActivityClick` par `onOpenMyActivity`
- ✅ `onOpenMyActivity` ouvre MON profil (`user.id`) avec focus sur l'activité
- ✅ Passage des props `initialFocusActivityId` et `initialFocusCommentId` à `UserProfileView`

**Code clé:**
```typescript
const [profileFocusActivityId, setProfileFocusActivityId] = useState<string | null>(null);
const [profileFocusCommentId, setProfileFocusCommentId] = useState<string | null>(null);

// Dans NotificationsModal
onOpenMyActivity={(activityId, commentId) => {
  setShowNotifications(false);
  setSelectedUserId(user?.id || null); // MON PROFIL
  setProfileFocusActivityId(activityId);
  setProfileFocusCommentId(commentId || null);
}}

// Dans UserProfileView
<UserProfileView
  userId={selectedUserId}
  initialFocusActivityId={profileFocusActivityId}
  initialFocusCommentId={profileFocusCommentId}
  ...
/>
```

### 3. UserProfileView - Support focus activité

**Fichier:** `src/components/UserProfileView.tsx`

**Changements:**
- ✅ Ajout de props : `initialFocusActivityId`, `initialFocusCommentId`
- ✅ Passage des props à `MyActivities` quand `showUserActivities` est true

**Code clé:**
```typescript
interface UserProfileViewProps {
  userId: string;
  onClose: () => void;
  onUserClick?: (userId: string) => void;
  initialFocusActivityId?: string | null;
  initialFocusCommentId?: string | null;
}

// Dans le render
if (showUserActivities) {
  return (
    <MyActivities
      userId={userId}
      initialFocusActivityId={initialFocusActivityId}
      initialFocusCommentId={initialFocusCommentId}
      ...
    />
  );
}
```

### 4. MyActivities - Focus et scroll

**Fichier:** `src/pages/MyActivities.tsx`

**Changements:**
- ✅ Ajout de props : `initialFocusActivityId`, `initialFocusCommentId`
- ✅ Ajout d'IDs sur chaque activité : `<div id={`activity-${activity.id}`}>`
- ✅ `useEffect` pour scroll vers l'activité après chargement
- ✅ Ouverture automatique de `CommentModal` si `initialFocusCommentId` existe
- ✅ Passage de `initialFocusCommentId` à `CommentModal`

**Code clé:**
```typescript
// States
const [focusedActivityId, setFocusedActivityId] = useState<string | null>(initialFocusActivityId || null);
const [focusedCommentId, setFocusedCommentId] = useState<string | null>(initialFocusCommentId || null);

// useEffect pour focus
useEffect(() => {
  if (initialFocusActivityId && activities.length > 0 && !loading) {
    const timer = setTimeout(() => {
      const element = document.getElementById(`activity-${initialFocusActivityId}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (initialFocusCommentId) {
          setCommentingActivityId(initialFocusActivityId);
          setFocusedActivityId(initialFocusActivityId);
          setFocusedCommentId(initialFocusCommentId);
        }
      }
    }, 300);
    return () => clearTimeout(timer);
  }
}, [initialFocusActivityId, activities.length, loading, initialFocusCommentId]);

// Render avec IDs
<div id={`activity-${activity.id}`}>
  <ActivityCard ... />
</div>
```

### 5. CommentModal - Support initialFocusCommentId (optionnel)

**Fichier:** `src/components/CommentModal.tsx`

**Changements:**
- ✅ Ajout de prop `initialFocusCommentId?: string`
- ⚠️ TODO: Implémenter le scroll vers le commentaire spécifique (nécessite un ID sur chaque commentaire)

### 6. Profile.tsx - Intégration

**Fichier:** `src/pages/Profile.tsx`

**Changements:**
- ✅ Ajout de states : `profileFocusActivityId`, `profileFocusCommentId`
- ✅ Remplacement de `onActivityClick` par `onOpenMyActivity`
- ✅ Passage des props à `UserProfileView`

## Mapping des types de notifications

| Type | Action | Destination |
|------|--------|-------------|
| `like` / `reaction` | `onOpenMyActivity(activityId, null)` | MON profil → Mes activités → Scroll vers activité |
| `comment` | `onOpenMyActivity(activityId, commentId)` | MON profil → Mes activités → Scroll vers activité → Ouvrir CommentModal avec focus commentaire |
| `follow` | `onUserClick(actor_id)` | Profil de l'utilisateur qui a suivi |
| Autre | Fallback | Activité si disponible, sinon profil |

## Sécurités / Mapping correct

✅ **Vérifications:**
- Chaque notification utilise `notif.activity?.id` (pas de state stale)
- Chaque row appelle `handleNotificationClick(notif)` avec le bon objet
- Le texte "A aimé votre lecture" ne déclenche jamais un focus commentaire (seulement `comment` notif)
- Les notifications LIKE/COMMENT ouvrent toujours MON profil, jamais le feed Home

## Plan de test

### Test 1: Notification LIKE
1. ✅ Créer une activité de lecture
2. ✅ Demander à un autre utilisateur de liker cette activité
3. ✅ Ouvrir le modal notifications
4. ✅ Cliquer sur la notification "X a aimé votre lecture"
5. **Résultat attendu:**
   - Modal se ferme
   - MON profil s'ouvre
   - Section "Mes activités" s'ouvre automatiquement
   - Scroll vers l'activité concernée
   - Pas de CommentModal ouvert

### Test 2: Notification COMMENT
1. ✅ Créer une activité de lecture
2. ✅ Demander à un autre utilisateur de commenter cette activité
3. ✅ Ouvrir le modal notifications
4. ✅ Cliquer sur la notification "X a commenté votre lecture"
5. **Résultat attendu:**
   - Modal se ferme
   - MON profil s'ouvre
   - Section "Mes activités" s'ouvre automatiquement
   - Scroll vers l'activité concernée
   - CommentModal s'ouvre automatiquement
   - (Optionnel) Scroll vers le commentaire spécifique

### Test 3: Notification FOLLOW
1. ✅ Demander à un autre utilisateur de vous suivre
2. ✅ Ouvrir le modal notifications
3. ✅ Cliquer sur la notification "X s'est abonné à vous"
4. **Résultat attendu:**
   - Modal se ferme
   - Profil de l'utilisateur qui a suivi s'ouvre
   - Pas de focus sur une activité

### Test 4: Marquage comme lu
1. ✅ Ouvrir le modal notifications
2. ✅ Vérifier qu'une notification unread a un fond neutre + dot
3. ✅ Cliquer sur la notification
4. **Résultat attendu:**
   - Le fond neutre disparaît immédiatement (optimiste)
   - Le dot disparaît
   - La notification est marquée comme lue en base

### Test 5: Interactions internes
1. ✅ Ouvrir le modal notifications
2. ✅ Cliquer sur l'avatar d'une notification
3. **Résultat attendu:**
   - Profil de l'utilisateur s'ouvre
   - Modal se ferme
   - Notification marquée comme lue

4. ✅ Cliquer sur le bouton "Suivre/Suivi"
5. **Résultat attendu:**
   - Toggle du follow (sans fermer le modal)
   - Pas de navigation

6. ✅ Cliquer sur le titre du livre
7. **Résultat attendu:**
   - MON profil s'ouvre avec focus sur l'activité
   - Modal se ferme

## Fichiers modifiés

1. ✅ `src/components/NotificationsModal.tsx` - Handler corrigé, style unread, row cliquable
2. ✅ `src/pages/Home.tsx` - Flow profil avec states focus
3. ✅ `src/components/UserProfileView.tsx` - Props focus + passage à MyActivities
4. ✅ `src/pages/MyActivities.tsx` - Focus, scroll, IDs sur activités
5. ✅ `src/components/CommentModal.tsx` - Prop initialFocusCommentId (TODO: scroll)
6. ✅ `src/pages/Profile.tsx` - Intégration avec states focus

## TODOs

1. **Scroll vers commentaire dans CommentModal:**
   - Ajouter un ID sur chaque commentaire : `<div id={`comment-${comment.id}`}>`
   - Implémenter le scroll vers `initialFocusCommentId` après chargement

2. **Gestion des notifications like/comment comme lues:**
   - Actuellement, ces notifications n'ont pas de champ `read` dans leur table
   - Elles sont marquées comme lues uniquement en state (optimiste)
   - Option: Créer une table de suivi ou ajouter un champ `read_at`

## Notes techniques

- Le style unread utilise `border border-neutral-200` (pas `border-l-2`)
- Le dot unread est positionné en `absolute` sur l'avatar
- Les boutons internes (avatar, follow) utilisent `stopPropagation`
- Le marquage comme lu est optimiste (state immédiat) puis synchro avec la DB
- Le scroll vers l'activité attend 300ms pour que le DOM soit prêt
- Les IDs sur les activités permettent le scroll précis : `activity-${activity.id}`

