-- ============================================
-- Script pour vérifier la structure de la table activitysessions
-- ============================================
-- Exécutez ce script dans Supabase SQL Editor pour obtenir
-- la structure exacte de la table activitysessions
-- ============================================

-- 1. Vérifier si la table existe
SELECT 
  '=== TABLE EXISTS? ===' as section,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'activitysessions'
    ) THEN '✅ OUI'
    ELSE '❌ NON'
  END as table_exists;

-- 2. Si la table existe, lister toutes les colonnes avec leurs types
SELECT 
  '=== COLUMNS ===' as section,
  column_name,
  data_type,
  character_maximum_length,
  is_nullable,
  column_default,
  ordinal_position
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'activitysessions'
ORDER BY ordinal_position;

-- 3. Lister les contraintes (primary key, foreign keys, unique, check)
SELECT 
  '=== CONSTRAINTS ===' as section,
  tc.constraint_type,
  tc.constraint_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
LEFT JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.table_schema = 'public'
  AND tc.table_name = 'activitysessions'
ORDER BY tc.constraint_type, kcu.ordinal_position;

-- 4. Vérifier si RLS est activé
SELECT 
  '=== RLS STATUS ===' as section,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename = 'activitysessions';

-- 5. Lister les politiques RLS
SELECT 
  '=== RLS POLICIES ===' as section,
  policyname,
  cmd as operation,
  qual as using_expression,
  with_check as with_check_expression
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'activitysessions'
ORDER BY policyname;

-- 6. Lister les index
SELECT 
  '=== INDEXES ===' as section,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'activitysessions'
ORDER BY indexname;

