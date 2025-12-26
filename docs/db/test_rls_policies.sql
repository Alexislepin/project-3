-- Script pour tester et vérifier les politiques RLS sur user_books

-- 1. Vérifier si RLS est activé
SELECT 
    schemaname,
    tablename,
    rowsecurity as "RLS Enabled"
FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'user_books';

-- 2. Lister toutes les politiques sur user_books
SELECT 
    policyname as "Policy Name",
    cmd as "Command",
    qual as "USING Expression",
    with_check as "WITH CHECK Expression",
    roles as "Roles"
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'user_books'
ORDER BY policyname;

-- 3. Vérifier si des livres existent pour cet utilisateur (sans RLS)
-- Cette requête devrait fonctionner même si RLS bloque
-- Note: Si vous êtes connecté en tant qu'admin/service_role, vous verrez tous les livres

-- Compter les livres pour l'utilisateur (pour admin/service_role)
SELECT 
    COUNT(*) as total_books,
    user_id
FROM user_books
WHERE user_id = 'f3433d13-a7b3-4379-9d89-25eae283491f'
GROUP BY user_id;

-- 4. Vérifier les livres avec les détails (pour admin/service_role)
SELECT 
    ub.*,
    b.title,
    b.author
FROM user_books ub
LEFT JOIN books b ON ub.book_id = b.id
WHERE ub.user_id = 'f3433d13-a7b3-4379-9d89-25eae283491f';











