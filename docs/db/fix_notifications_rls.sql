-- Nettoyer les politiques RLS dupliquées pour la table notifications

-- Supprimer toutes les politiques existantes
DROP POLICY IF EXISTS "Users can read their own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can read own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can update their own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
DROP POLICY IF EXISTS "Allow notification inserts" ON notifications;

-- Recréer les politiques correctement (sans doublons)
-- 1. Politique pour la lecture : les utilisateurs peuvent lire leurs propres notifications
CREATE POLICY "Users can read own notifications"
  ON notifications
  FOR SELECT
  USING (auth.uid() = user_id);

-- 2. Politique pour la mise à jour : les utilisateurs peuvent marquer leurs notifications comme lues
CREATE POLICY "Users can update own notifications"
  ON notifications
  FOR UPDATE
  USING (auth.uid() = user_id);

-- 3. Politique pour l'insertion : permettre l'insertion (pour le trigger et le code)
CREATE POLICY "Allow notification inserts"
  ON notifications
  FOR INSERT
  WITH CHECK (true);

-- Vérifier les politiques finales
SELECT 
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE schemaname = 'public' 
AND tablename = 'notifications'
ORDER BY cmd, policyname;










