# Améliorations du Modal Notifications

## Date: 2025-01-XX

## Modifications effectuées

### 1. UI - Style premium pour notifications unread

**Problème:** Fond jaune moche (`bg-yellow-50/40`) sur les notifications non lues.

**Solution:**
- ✅ Remplacement du fond jaune par un style neutre premium
- ✅ Unread: `bg-neutral-50 border-l-2 border-l-neutral-300` avec hover `hover:bg-neutral-100`
- ✅ Read: `bg-white` avec hover `hover:bg-gray-50`
- ✅ Ajout d'un petit dot (`w-2 h-2 rounded-full bg-neutral-400`) en haut à droite de l'avatar pour les notifications unread
- ✅ Séparateurs propres (`border-b border-gray-100`)

**Fichier modifié:** `src/components/NotificationsModal.tsx`
- Ligne 110-115: Remplacement des classes CSS pour le style unread/read
- Ligne 117-123: Ajout du dot unread sur l'avatar

### 2. UX - Navigation cliquable selon le type

**Problème:** Les notifications n'étaient pas cliquables pour naviguer vers le contenu associé.

**Solution:**
- ✅ Chaque notification est maintenant entièrement cliquable
- ✅ Navigation selon le type:
  - `like` / `reaction` → Ouvrir l'activité correspondante
  - `comment` → Ouvrir l'activité avec focus sur le commentaire (si `commentId` disponible)
  - `follow` → Ouvrir le profil de l'utilisateur qui a suivi
  - Fallback → Activité si `activity_id` existe, sinon profil si `actor_id` existe

**Fichiers modifiés:**
- `src/components/NotificationsModal.tsx`:
  - Ligne 8-11: Ajout de `onActivityClick` dans `NotificationsModalProps`
  - Ligne 85-105: Ajout de `onClick` dans `NotificationItem`
  - Ligne 108-184: Rendu de `NotificationItem` avec `onClick` et `cursor-pointer`
  - Ligne 214-232: Nouvelle fonction `markNotificationAsRead` pour marquer une notification comme lue
  - Ligne 443-465: Nouvelle fonction `handleNotificationClick` avec mapping des types
  - Ligne 467-520: Transformation des notifications avec `originalNotif` et `commentId`
  - Ligne 516-550: Utilisation de `handleNotificationClick` dans le rendu

- `src/pages/Profile.tsx`:
  - Ligne 817-826: Ajout de `onActivityClick` (TODO: implémenter la navigation vers l'activité)

- `src/pages/Home.tsx`:
  - Ligne 809-820: Ajout de `onActivityClick` qui ouvre `CommentModal` avec `activityId`

### 3. Marquage comme lu au clic

**Problème:** Les notifications n'étaient marquées comme lues qu'à l'ouverture du modal.

**Solution:**
- ✅ Marquage optimiste en state immédiatement au clic
- ✅ Mise à jour en base de données via `markNotificationAsRead`
- ✅ Support pour les notifications de type `follow` (table `notifications`)
- ✅ Les notifications `like` et `comment` n'ont pas de champ `read` dans leur table, mais sont marquées comme lues en state

**Fichier modifié:** `src/components/NotificationsModal.tsx`
- Ligne 214-232: Fonction `markNotificationAsRead` avec update optimiste

### 4. Support du commentId pour focus

**Problème:** Impossible de scroller vers un commentaire spécifique lors de l'ouverture d'une activité.

**Solution:**
- ✅ Ajout de `commentId` dans les données transformées
- ✅ Passage de `commentId` à `onActivityClick` pour les notifications de type `comment`
- ✅ TODO: Implémenter le scroll vers le commentaire dans `CommentModal` (nécessite une ref ou un state)

**Fichiers modifiés:**
- `src/components/NotificationsModal.tsx`:
  - Ligne 340-345: Ajout de `id` dans `comment` lors du mapping
  - Ligne 467-520: Ajout de `commentId` dans `transformedNotifications`

## Mapping des types de notifications

| Type | Action | Paramètres |
|------|--------|------------|
| `like` / `reaction` | Ouvrir activité | `activityId` |
| `comment` | Ouvrir activité + focus commentaire | `activityId`, `commentId` |
| `follow` | Ouvrir profil utilisateur | `userId` (actor_id) |
| Autre | Fallback | `activityId` si disponible, sinon `userId` |

## Plan de test

### Test UI
1. ✅ Ouvrir le modal notifications
2. ✅ Vérifier que les notifications unread ont un fond neutre (`bg-neutral-50`) et un dot
3. ✅ Vérifier que les notifications read ont un fond blanc
4. ✅ Vérifier que le hover fonctionne sur les deux types
5. ✅ Vérifier que les séparateurs sont propres

### Test Navigation
1. ✅ Cliquer sur une notification de type `like` → Doit ouvrir `CommentModal` avec l'activité
2. ✅ Cliquer sur une notification de type `comment` → Doit ouvrir `CommentModal` avec l'activité (TODO: scroller vers le commentaire)
3. ✅ Cliquer sur une notification de type `follow` → Doit ouvrir le profil de l'utilisateur
4. ✅ Vérifier que le modal se ferme après le clic

### Test Marquage comme lu
1. ✅ Cliquer sur une notification unread → Doit disparaître le dot et le fond neutre immédiatement
2. ✅ Vérifier en base que `read: true` est bien mis à jour pour les notifications `follow`
3. ✅ Vérifier que le compteur de notifications non lues se met à jour

### Test Interactions
1. ✅ Cliquer sur l'avatar → Doit ouvrir le profil (sans fermer le modal)
2. ✅ Cliquer sur le bouton "Suivre/Suivi" → Doit toggle le follow (sans fermer le modal)
3. ✅ Cliquer sur le titre du livre → Doit ouvrir l'activité (sans fermer le modal)

## Fichiers modifiés

1. `src/components/NotificationsModal.tsx` - Refactorisation complète du style et ajout de la navigation
2. `src/pages/Profile.tsx` - Ajout de `onActivityClick` (TODO: implémenter)
3. `src/pages/Home.tsx` - Ajout de `onActivityClick` qui ouvre `CommentModal`

## TODOs

1. **Navigation vers activité depuis Profile.tsx:**
   - Actuellement, `onActivityClick` dans `Profile.tsx` ne fait que logger
   - Il faudrait soit naviguer vers Home, soit ouvrir un modal d'activité
   - Option: Utiliser le système de navigation existant (`setCurrentView('home')`)

2. **Scroll vers commentaire dans CommentModal:**
   - `CommentModal` reçoit `activityId` mais pas `commentId`
   - Il faudrait ajouter un prop `highlightCommentId` et scroller vers ce commentaire à l'ouverture
   - Option: Utiliser `useRef` et `scrollIntoView` sur le commentaire ciblé

3. **Gestion des notifications like/comment comme lues:**
   - Actuellement, ces notifications n'ont pas de champ `read` dans leur table
   - Il faudrait soit créer une table de suivi, soit ajouter un champ `read_at` dans les tables `activity_reactions` et `activity_comments`
   - Pour l'instant, elles sont marquées comme lues uniquement en state (optimiste)

## Notes techniques

- Le style unread utilise `border-l-2` pour une bordure gauche subtile au lieu d'un fond complet
- Le dot unread est positionné en `absolute` sur l'avatar avec `-top-0.5 -right-0.5`
- Les boutons (avatar, follow) utilisent `stopPropagation` pour éviter de déclencher le clic sur la notification
- Le marquage comme lu est optimiste (state immédiat) puis synchro avec la DB

