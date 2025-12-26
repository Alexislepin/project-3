-- Script de test complet pour les notifications

-- 1. Vérifier la structure de la table user_profiles
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
AND table_name = 'user_profiles'
ORDER BY ordinal_position;

-- 2. Vérifier votre user_id actuel
SELECT 
  id,
  email,
  raw_user_meta_data
FROM auth.users
WHERE id = auth.uid();

-- 3. Vérifier votre profil (avec toutes les colonnes disponibles)
SELECT *
FROM user_profiles
WHERE id = auth.uid();

-- 4. Vérifier toutes vos notifications (sans join d'abord pour voir les données brutes)
SELECT 
  n.id,
  n.type,
  n.user_id,
  n.actor_id,
  n.read,
  n.created_at
FROM notifications n
WHERE n.user_id = auth.uid()
ORDER BY n.created_at DESC;

-- 5. Vérifier toutes vos notifications (avec les profils si la colonne existe)
-- Cette requête fonctionnera seulement si display_name existe
SELECT 
  n.id,
  n.type,
  n.user_id,
  n.actor_id,
  n.read,
  n.created_at,
  up_actor.id as actor_profile_id
FROM notifications n
LEFT JOIN user_profiles up_actor ON n.actor_id = up_actor.id
WHERE n.user_id = auth.uid()
ORDER BY n.created_at DESC;

-- 6. Vérifier qui vous suit (sans join d'abord)
SELECT 
  f.follower_id,
  f.following_id,
  f.created_at
FROM follows f
WHERE f.following_id = auth.uid()
ORDER BY f.created_at DESC;

-- 7. Créer une notification de test
-- Décommentez et exécutez cette ligne après avoir noté votre user_id :
/*
INSERT INTO notifications (user_id, type, actor_id)
VALUES (
  auth.uid(),  -- Votre user_id
  'follow',
  auth.uid()  -- Pour le test, on utilise le même ID
)
RETURNING *;
*/

-- 8. Vérifier les politiques RLS
SELECT 
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public' 
AND tablename = 'notifications';

-- 9. Tester la lecture avec votre user_id
-- Remplacez 'VOTRE_USER_ID' par votre vrai user_id
/*
SELECT * FROM notifications 
WHERE user_id = 'VOTRE_USER_ID' 
AND type = 'follow';
*/

