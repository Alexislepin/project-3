-- Script pour diagnostiquer le problème des livres

-- 1. Vérifier TOUS les user_books (sans filtre)
SELECT 
    ub.id,
    ub.user_id,
    ub.book_id,
    ub.status,
    b.title,
    b.author
FROM user_books ub
LEFT JOIN books b ON ub.book_id = b.id
ORDER BY ub.user_id
LIMIT 50;

-- 2. Compter les livres par utilisateur
SELECT 
    ub.user_id,
    up.username,
    up.display_name,
    COUNT(*) as total_books,
    COUNT(*) FILTER (WHERE ub.status = 'reading') as reading_count,
    COUNT(*) FILTER (WHERE ub.status = 'completed') as completed_count,
    COUNT(*) FILTER (WHERE ub.status = 'want_to_read') as want_to_read_count
FROM user_books ub
LEFT JOIN user_profiles up ON ub.user_id = up.id
GROUP BY ub.user_id, up.username, up.display_name
ORDER BY total_books DESC;

-- 3. Vérifier si l'utilisateur existe
SELECT 
    id,
    username,
    display_name
FROM user_profiles
WHERE id = 'f3433d13-a7b3-4379-9d89-25eae283491f';

-- 4. Vérifier tous les user_books pour cet utilisateur (même avec un autre ID similaire)
SELECT 
    ub.*,
    b.title,
    b.author
FROM user_books ub
LEFT JOIN books b ON ub.book_id = b.id
WHERE ub.user_id::text LIKE '%f3433d13%' OR ub.user_id::text LIKE '%25eae283491f%';











