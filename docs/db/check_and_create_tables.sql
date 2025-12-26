-- Script pour vérifier et créer toutes les tables nécessaires
-- Exécutez ce script dans Supabase SQL Editor

-- 1. Vérifier quelles tables existent
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- 2. Créer la table user_profiles si elle n'existe pas
CREATE TABLE IF NOT EXISTS user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text UNIQUE NOT NULL,
  display_name text NOT NULL,
  bio text,
  avatar_url text,
  current_streak integer DEFAULT 0,
  longest_streak integer DEFAULT 0,
  total_pages_read integer DEFAULT 0,
  total_books_completed integer DEFAULT 0,
  total_hours_logged integer DEFAULT 0,
  interests text[] DEFAULT '{}',
  notifications_enabled boolean DEFAULT false,
  notification_time time DEFAULT '20:00:00',
  goal_reminder_enabled boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 3. Créer la table books si elle n'existe pas
CREATE TABLE IF NOT EXISTS books (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  author text,
  isbn text,
  cover_url text,
  description text,
  total_pages integer,
  edition text,
  google_books_id text,
  created_at timestamptz DEFAULT now()
);

-- 4. Créer la table user_books si elle n'existe pas
CREATE TABLE IF NOT EXISTS user_books (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES user_profiles(id) ON DELETE CASCADE NOT NULL,
  book_id uuid REFERENCES books(id) ON DELETE CASCADE NOT NULL,
  status text NOT NULL CHECK (status IN ('reading', 'completed', 'want_to_read', 'abandoned')),
  current_page integer DEFAULT 0,
  started_at timestamptz,
  completed_at timestamptz,
  rating integer CHECK (rating >= 1 AND rating <= 5),
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, book_id)
);

-- 5. Créer la table activities si elle n'existe pas
CREATE TABLE IF NOT EXISTS activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES user_profiles(id) ON DELETE CASCADE NOT NULL,
  type text NOT NULL CHECK (type IN ('reading', 'workout', 'learning', 'habit')),
  title text NOT NULL,
  description text,
  book_id uuid REFERENCES books(id) ON DELETE SET NULL,
  pages_read integer DEFAULT 0,
  duration_minutes integer DEFAULT 0,
  visibility text DEFAULT 'public' CHECK (visibility IN ('public', 'followers', 'private')),
  photos text[] DEFAULT '{}',
  quotes jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now()
);

-- 6. Créer la table follows si elle n'existe pas
CREATE TABLE IF NOT EXISTS follows (
  follower_id uuid REFERENCES user_profiles(id) ON DELETE CASCADE NOT NULL,
  following_id uuid REFERENCES user_profiles(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (follower_id, following_id),
  CHECK (follower_id != following_id)
);

-- 7. Créer la table notifications si elle n'existe pas
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES user_profiles(id) ON DELETE CASCADE NOT NULL,
  type text NOT NULL CHECK (type IN ('follow', 'activity', 'reaction', 'comment')),
  actor_id uuid REFERENCES user_profiles(id) ON DELETE CASCADE NOT NULL,
  read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- 8. Créer la table activity_reactions si elle n'existe pas
CREATE TABLE IF NOT EXISTS activity_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid REFERENCES activities(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES user_profiles(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(activity_id, user_id)
);

-- 9. Créer la table activity_comments si elle n'existe pas
CREATE TABLE IF NOT EXISTS activity_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid REFERENCES activities(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES user_profiles(id) ON DELETE CASCADE NOT NULL,
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- 10. Créer la table user_goals si elle n'existe pas
CREATE TABLE IF NOT EXISTS user_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES user_profiles(id) ON DELETE CASCADE NOT NULL,
  type text NOT NULL CHECK (type IN (
    'daily_pages', 'weekly_workouts', 'daily_time', 'weekly_books',
    'daily_15min', 'daily_30min', 'daily_60min', 'weekly_pages'
  )),
  target_value integer NOT NULL,
  period text NOT NULL CHECK (period IN ('daily', 'weekly')),
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- 11. Créer les index pour les performances
CREATE INDEX IF NOT EXISTS idx_activities_user_id ON activities(user_id);
CREATE INDEX IF NOT EXISTS idx_activities_created_at ON activities(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activities_visibility ON activities(visibility);
CREATE INDEX IF NOT EXISTS idx_user_books_user_id ON user_books(user_id);
CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

-- 12. Activer RLS sur toutes les tables
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE books ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_books ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_goals ENABLE ROW LEVEL SECURITY;

-- 13. Créer les politiques RLS de base (lecture publique pour certaines tables)
-- User profiles: lecture publique, modification par le propriétaire
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON user_profiles;
CREATE POLICY "Public profiles are viewable by everyone" ON user_profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
CREATE POLICY "Users can update own profile" ON user_profiles FOR UPDATE USING (auth.uid() = id);

-- Books: lecture publique
DROP POLICY IF EXISTS "Books are viewable by everyone" ON books;
CREATE POLICY "Books are viewable by everyone" ON books FOR SELECT USING (true);

-- User books: lecture publique, modification par le propriétaire
DROP POLICY IF EXISTS "User books are viewable by everyone" ON user_books;
CREATE POLICY "User books are viewable by everyone" ON user_books FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can manage own books" ON user_books;
CREATE POLICY "Users can manage own books" ON user_books FOR ALL USING (auth.uid() = user_id);

-- Activities: lecture publique, modification par le propriétaire
DROP POLICY IF EXISTS "Activities are viewable by everyone" ON activities;
CREATE POLICY "Activities are viewable by everyone" ON activities FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can manage own activities" ON activities;
CREATE POLICY "Users can manage own activities" ON activities FOR ALL USING (auth.uid() = user_id);

-- Follows: lecture publique, insertion/suppression par le propriétaire
DROP POLICY IF EXISTS "Follows are viewable by everyone" ON follows;
CREATE POLICY "Follows are viewable by everyone" ON follows FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can manage own follows" ON follows;
CREATE POLICY "Users can manage own follows" ON follows FOR ALL USING (auth.uid() = follower_id);

-- Notifications: lecture par le propriétaire
DROP POLICY IF EXISTS "Users can read own notifications" ON notifications;
CREATE POLICY "Users can read own notifications" ON notifications FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
CREATE POLICY "Users can update own notifications" ON notifications FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Allow notification inserts" ON notifications;
CREATE POLICY "Allow notification inserts" ON notifications FOR INSERT WITH CHECK (true);

-- Activity reactions: lecture publique, modification par le propriétaire
DROP POLICY IF EXISTS "Reactions are viewable by everyone" ON activity_reactions;
CREATE POLICY "Reactions are viewable by everyone" ON activity_reactions FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can manage own reactions" ON activity_reactions;
CREATE POLICY "Users can manage own reactions" ON activity_reactions FOR ALL USING (auth.uid() = user_id);

-- Activity comments: lecture publique, modification par le propriétaire
DROP POLICY IF EXISTS "Comments are viewable by everyone" ON activity_comments;
CREATE POLICY "Comments are viewable by everyone" ON activity_comments FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can manage own comments" ON activity_comments;
CREATE POLICY "Users can manage own comments" ON activity_comments FOR ALL USING (auth.uid() = user_id);

-- User goals: lecture par le propriétaire
DROP POLICY IF EXISTS "Users can read own goals" ON user_goals;
CREATE POLICY "Users can read own goals" ON user_goals FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage own goals" ON user_goals;
CREATE POLICY "Users can manage own goals" ON user_goals FOR ALL USING (auth.uid() = user_id);

-- 14. Créer la fonction pour créer automatiquement un profil utilisateur
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.user_profiles (id, username, display_name)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'username', 'user_' || substring(new.id::text from 1 for 8)),
    COALESCE(new.raw_user_meta_data->>'display_name', 'User')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 15. Créer la fonction et le trigger pour les notifications de follow
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

DROP TRIGGER IF EXISTS on_follow_create_notification ON follows;
CREATE TRIGGER on_follow_create_notification
  AFTER INSERT ON follows
  FOR EACH ROW
  EXECUTE FUNCTION create_follow_notification();

-- 16. Afficher un résumé
SELECT 
  'Tables créées avec succès!' as message,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public') as total_tables;

