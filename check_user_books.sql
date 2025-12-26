-- Script pour vérifier les livres d'un utilisateur
-- Remplacez 'f3433d13-a7b3-4379-9d89-25eae283491f' par l'ID de l'utilisateur que vous voulez vérifier

-- Vérifier si l'utilisateur a des livres
SELECT 
    ub.id,
    ub.user_id,
    ub.book_id,
    ub.status,
    ub.current_page,
    b.title,
    b.author
FROM user_books ub
JOIN books b ON ub.book_id = b.id
WHERE ub.user_id = 'f3433d13-a7b3-4379-9d89-25eae283491f';

-- Compter les livres
SELECT 
    COUNT(*) as total_books,
    COUNT(*) FILTER (WHERE status = 'reading') as reading_count,
    COUNT(*) FILTER (WHERE status = 'completed') as completed_count,
    COUNT(*) FILTER (WHERE status = 'want_to_read') as want_to_read_count
FROM user_books
WHERE user_id = 'f3433d13-a7b3-4379-9d89-25eae283491f';

-- Vérifier les politiques RLS actuelles sur user_books
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'user_books';











