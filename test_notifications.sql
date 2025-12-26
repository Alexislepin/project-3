-- Script de test pour vérifier les notifications

-- 1. Vérifier si la table notifications existe
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name = 'notifications'
) AS table_exists;

-- 2. Vérifier les notifications existantes
SELECT 
  n.id,
  n.type,
  n.user_id,
  n.actor_id,
  n.read,
  n.created_at,
  up_actor.display_name as actor_name,
  up_user.display_name as user_name
FROM notifications n
LEFT JOIN user_profiles up_actor ON n.actor_id = up_actor.id
LEFT JOIN user_profiles up_user ON n.user_id = up_user.id
ORDER BY n.created_at DESC
LIMIT 10;

-- 3. Créer une notification de test (remplacez les UUIDs par de vrais IDs d'utilisateurs)
-- INSERT INTO notifications (user_id, type, actor_id)
-- VALUES (
--   'USER_ID_QUI_RECOIT_LA_NOTIF',  -- L'utilisateur qui reçoit la notification
--   'follow',
--   'ACTOR_ID_QUI_SUIT'  -- L'utilisateur qui suit
-- );

-- 4. Vérifier les follows existants
SELECT 
  f.follower_id,
  f.following_id,
  up_follower.display_name as follower_name,
  up_following.display_name as following_name
FROM follows f
LEFT JOIN user_profiles up_follower ON f.follower_id = up_follower.id
LEFT JOIN user_profiles up_following ON f.following_id = up_following.id
ORDER BY f.follower_id;

-- 5. Vérifier si le trigger existe
SELECT 
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE trigger_name = 'on_follow_create_notification';










