-- Script simple pour créer la table notifications dans votre projet Supabase actuel
-- Exécutez ce script dans Supabase SQL Editor du projet: iwrhdzsglclvdztqwlys

-- 1. Créer la table notifications
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL CHECK (type IN ('follow', 'activity', 'reaction', 'comment')),
  actor_id uuid NOT NULL,
  read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- 2. Créer les index
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, read, created_at DESC);

-- 3. Activer RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- 4. Créer les politiques RLS
-- Lecture : les utilisateurs peuvent lire leurs propres notifications
DROP POLICY IF EXISTS "Users can read own notifications" ON notifications;
CREATE POLICY "Users can read own notifications"
  ON notifications
  FOR SELECT
  USING (auth.uid() = user_id);

-- Mise à jour : les utilisateurs peuvent marquer leurs notifications comme lues
DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
CREATE POLICY "Users can update own notifications"
  ON notifications
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Insertion : permettre l'insertion (pour le trigger et le code)
DROP POLICY IF EXISTS "Allow notification inserts" ON notifications;
CREATE POLICY "Allow notification inserts"
  ON notifications
  FOR INSERT
  WITH CHECK (true);

-- 5. Créer la fonction pour les notifications de follow
CREATE OR REPLACE FUNCTION create_follow_notification()
RETURNS trigger AS $$
BEGIN
  IF NEW.follower_id = NEW.following_id THEN
    RETURN NEW;
  END IF;
  
  INSERT INTO notifications (user_id, type, actor_id)
  VALUES (NEW.following_id, 'follow', NEW.follower_id);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Créer le trigger (seulement si la table follows existe)
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'follows') THEN
    DROP TRIGGER IF EXISTS on_follow_create_notification ON follows;
    CREATE TRIGGER on_follow_create_notification
      AFTER INSERT ON follows
      FOR EACH ROW
      EXECUTE FUNCTION create_follow_notification();
    RAISE NOTICE 'Trigger créé avec succès';
  ELSE
    RAISE NOTICE 'Table follows n''existe pas encore. Le trigger sera créé plus tard.';
  END IF;
END $$;

-- 7. Vérifier que tout est créé
SELECT 
  'Table notifications créée ✅' as status,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'notifications') as table_exists;










