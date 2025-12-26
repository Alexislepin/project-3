-- =====================================================
-- FIX RLS POLICIES FOR user_books TABLE
-- =====================================================
-- Copiez-collez ce script COMPLET dans Supabase SQL Editor et exécutez-le
-- =====================================================

-- Étape 1: Activer RLS
ALTER TABLE public.user_books ENABLE ROW LEVEL SECURITY;

-- Étape 2: Supprimer TOUTES les politiques existantes
DROP POLICY IF EXISTS "authenticated_users_can_read_all_user_books" ON public.user_books;
DROP POLICY IF EXISTS "Authenticated users can read user_books" ON public.user_books;
DROP POLICY IF EXISTS "users_can_read_own_books" ON public.user_books;
DROP POLICY IF EXISTS "Public read access for user_books" ON public.user_books;
DROP POLICY IF EXISTS "users_can_insert_own_books" ON public.user_books;
DROP POLICY IF EXISTS "users_can_update_own_books" ON public.user_books;
DROP POLICY IF EXISTS "users_can_delete_own_books" ON public.user_books;

-- Supprimer toutes les autres politiques qui pourraient exister
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT policyname 
        FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'user_books'
    ) 
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON public.user_books';
    END LOOP;
END $$;

-- Étape 3: Créer les nouvelles politiques

-- Politique 1: Permettre à TOUS les utilisateurs authentifiés de LIRE tous les user_books
CREATE POLICY "authenticated_read_all_user_books"
  ON public.user_books
  FOR SELECT
  TO authenticated
  USING (true);

-- Politique 2: Permettre aux utilisateurs d'INSÉRER leurs propres livres
CREATE POLICY "users_insert_own_books"
  ON public.user_books
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Politique 3: Permettre aux utilisateurs de MODIFIER leurs propres livres
CREATE POLICY "users_update_own_books"
  ON public.user_books
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Politique 4: Permettre aux utilisateurs de SUPPRIMER leurs propres livres
CREATE POLICY "users_delete_own_books"
  ON public.user_books
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- =====================================================
-- VÉRIFICATION (optionnel - décommentez pour tester)
-- =====================================================

-- Vérifier les politiques créées
-- SELECT policyname, cmd, roles FROM pg_policies 
-- WHERE schemaname = 'public' AND tablename = 'user_books';

-- Vérifier si des livres existent pour un utilisateur spécifique
-- Remplacez l'ID par l'ID de l'utilisateur que vous voulez tester
-- SELECT COUNT(*) FROM user_books WHERE user_id = 'f3433d13-a7b3-4379-9d89-25eae283491f';











