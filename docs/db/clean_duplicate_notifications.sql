-- Script pour supprimer les notifications en double
-- Exécutez ce script dans Supabase SQL Editor

-- Supprimer les doublons de notifications de follow
-- On garde la notification la plus récente pour chaque combinaison (user_id, actor_id, type)
DELETE FROM notifications
WHERE id IN (
  SELECT id
  FROM (
    SELECT 
      id,
      ROW_NUMBER() OVER (
        PARTITION BY user_id, actor_id, type 
        ORDER BY created_at DESC
      ) as rn
    FROM notifications
    WHERE type = 'follow'
  ) t
  WHERE rn > 1
);

-- Afficher le résultat
SELECT 
  '✅ Notifications en double supprimées!' as message,
  COUNT(*) as total_notifications,
  COUNT(DISTINCT (user_id, actor_id, type)) as notifications_uniques
FROM notifications
WHERE type = 'follow';










