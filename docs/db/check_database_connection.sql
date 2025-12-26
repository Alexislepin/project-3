-- Script pour vérifier à quelle base de données vous êtes connecté

-- 1. Vérifier la version de PostgreSQL
SELECT version();

-- 2. Vérifier le nom de la base de données actuelle
SELECT current_database();

-- 3. Vérifier toutes les tables dans le schéma public
SELECT 
  table_name,
  table_type
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- 4. Vérifier si la table notifications existe
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'notifications'
    ) THEN 'Table notifications existe ✅'
    ELSE 'Table notifications n''existe PAS ❌'
  END as status_notifications;

-- 5. Vérifier si la table user_profiles existe
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'user_profiles'
    ) THEN 'Table user_profiles existe ✅'
    ELSE 'Table user_profiles n''existe PAS ❌'
  END as status_user_profiles;

-- 6. Compter le nombre total de tables
SELECT COUNT(*) as total_tables
FROM information_schema.tables 
WHERE table_schema = 'public';










