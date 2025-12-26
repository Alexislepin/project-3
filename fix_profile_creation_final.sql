-- Script FINAL pour corriger la création de profil
-- Exécutez ce script dans Supabase SQL Editor

-- 1. Vérifier que la table existe
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_profiles') THEN
    RAISE EXCEPTION 'La table user_profiles n''existe pas. Exécutez d''abord setup_complete_database.sql';
  END IF;
END $$;

-- 2. Activer RLS
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- 3. Supprimer TOUTES les politiques existantes
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON user_profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON user_profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON user_profiles;
DROP POLICY IF EXISTS "Allow profile creation" ON user_profiles;

-- 4. Créer les politiques CORRECTES

-- Lecture : tout le monde peut lire les profils
CREATE POLICY "Public profiles are viewable by everyone"
  ON user_profiles
  FOR SELECT
  USING (true);

-- Insertion : les utilisateurs peuvent créer leur propre profil
-- IMPORTANT: auth.uid() doit correspondre à l'id du profil
CREATE POLICY "Users can insert own profile"
  ON user_profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Mise à jour : les utilisateurs peuvent modifier leur propre profil
CREATE POLICY "Users can update own profile"
  ON user_profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- 5. Créer/Modifier la fonction handle_new_user avec gestion d'erreur
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.user_profiles (id, username, display_name)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'username', 'user_' || substring(new.id::text from 1 for 8)),
    COALESCE(new.raw_user_meta_data->>'display_name', 'User')
  )
  ON CONFLICT (id) DO UPDATE SET
    username = COALESCE(EXCLUDED.username, user_profiles.username),
    display_name = COALESCE(EXCLUDED.display_name, user_profiles.display_name);
  RETURN new;
EXCEPTION
  WHEN others THEN
    -- Si erreur, ne pas bloquer la création du compte auth
    RAISE WARNING 'Erreur lors de la création du profil: %', SQLERRM;
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Créer le trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 7. Vérifier les politiques
SELECT 
  '✅ Configuration terminée!' as message,
  policyname,
  cmd
FROM pg_policies
WHERE schemaname = 'public' 
AND tablename = 'user_profiles'
ORDER BY cmd, policyname;










