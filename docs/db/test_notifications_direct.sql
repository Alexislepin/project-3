-- Script de test pour vérifier les notifications

-- 1. Vérifier si vous avez des notifications
SELECT 
  n.id,
  n.type,
  n.user_id,
  n.actor_id,
  n.read,
  n.created_at,
  up_actor.display_name as qui_vous_suit,
  up_user.display_name as votre_nom
FROM notifications n
LEFT JOIN user_profiles up_actor ON n.actor_id = up_actor.id
LEFT JOIN user_profiles up_user ON n.user_id = up_user.id
WHERE n.type = 'follow'
ORDER BY n.created_at DESC
LIMIT 10;

-- 2. Vérifier vos follows (qui vous suit)
SELECT 
  f.follower_id,
  f.following_id,
  up_follower.display_name as qui_vous_suit,
  up_following.display_name as vous
FROM follows f
LEFT JOIN user_profiles up_follower ON f.follower_id = up_follower.id
LEFT JOIN user_profiles up_following ON f.following_id = up_following.id
WHERE f.following_id = auth.uid()  -- Les gens qui vous suivent
ORDER BY f.created_at DESC;

-- 3. Créer une notification de test (remplacez YOUR_USER_ID par votre vrai user_id)
-- Pour trouver votre user_id, exécutez d'abord :
-- SELECT id, display_name, username FROM user_profiles;

-- Puis créez une notification de test :
-- INSERT INTO notifications (user_id, type, actor_id)
-- VALUES (
--   'YOUR_USER_ID',  -- Votre user_id
--   'follow',
--   'YOUR_USER_ID'  -- Pour le test, on utilise le même ID
-- );










