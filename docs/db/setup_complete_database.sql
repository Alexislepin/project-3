/*
  # Setup Complet de la Base de Données
  Script pour créer toutes les tables nécessaires pour l'application
  
  Instructions:
  1. Créez un nouveau projet Supabase
  2. Allez dans SQL Editor
  3. Exécutez ce script complet
  4. Toutes les tables seront créées avec les politiques RLS
*/

-- ============================================
-- 1. TABLE user_profiles
-- ============================================
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

-- ============================================
-- 2. TABLE books
-- ============================================
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

-- ============================================
-- 3. TABLE user_books
-- ============================================
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

-- ============================================
-- 4. TABLE activities
-- ============================================
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

-- ============================================
-- 5. TABLE follows
-- ============================================
CREATE TABLE IF NOT EXISTS follows (
  follower_id uuid REFERENCES user_profiles(id) ON DELETE CASCADE NOT NULL,
  following_id uuid REFERENCES user_profiles(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (follower_id, following_id),
  CHECK (follower_id != following_id)
);

-- ============================================
-- 6. TABLE notifications
-- ============================================
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES user_profiles(id) ON DELETE CASCADE NOT NULL,
  type text NOT NULL CHECK (type IN ('follow', 'activity', 'reaction', 'comment')),
  actor_id uuid REFERENCES user_profiles(id) ON DELETE CASCADE NOT NULL,
  read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- ============================================
-- 7. TABLE activity_reactions
-- ============================================
CREATE TABLE IF NOT EXISTS activity_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid REFERENCES activities(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES user_profiles(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(activity_id, user_id)
);

-- ============================================
-- 8. TABLE activity_comments
-- ============================================
CREATE TABLE IF NOT EXISTS activity_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid REFERENCES activities(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES user_profiles(id) ON DELETE CASCADE NOT NULL,
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- ============================================
-- 9. TABLE user_goals
-- ============================================
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

-- ============================================
-- 10. TABLE clubs (optionnel)
-- ============================================
CREATE TABLE IF NOT EXISTS clubs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  category text,
  is_private boolean DEFAULT false,
  creator_id uuid REFERENCES user_profiles(id) ON DELETE CASCADE NOT NULL,
  member_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS club_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid REFERENCES clubs(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES user_profiles(id) ON DELETE CASCADE NOT NULL,
  role text DEFAULT 'member' CHECK (role IN ('admin', 'moderator', 'member')),
  joined_at timestamptz DEFAULT now(),
  UNIQUE(club_id, user_id)
);

-- ============================================
-- 11. INDEXES pour les performances
-- ============================================
CREATE INDEX IF NOT EXISTS idx_activities_user_id ON activities(user_id);
CREATE INDEX IF NOT EXISTS idx_activities_created_at ON activities(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activities_visibility ON activities(visibility);
CREATE INDEX IF NOT EXISTS idx_user_books_user_id ON user_books(user_id);
CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_goals_user_id ON user_goals(user_id);
CREATE INDEX IF NOT EXISTS idx_user_goals_active ON user_goals(user_id, active) WHERE active = true;

-- ============================================
-- 12. ACTIVER RLS sur toutes les tables
-- ============================================
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE books ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_books ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE clubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE club_members ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 13. POLITIQUES RLS - user_profiles
-- ============================================
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON user_profiles;
CREATE POLICY "Public profiles are viewable by everyone"
  ON user_profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can insert own profile" ON user_profiles;
CREATE POLICY "Users can insert own profile"
  ON user_profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ============================================
-- 14. POLITIQUES RLS - books
-- ============================================
DROP POLICY IF EXISTS "Books are viewable by everyone" ON books;
CREATE POLICY "Books are viewable by everyone"
  ON books FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can insert books" ON books;
CREATE POLICY "Anyone can insert books"
  ON books FOR INSERT WITH CHECK (true);

-- ============================================
-- 15. POLITIQUES RLS - user_books
-- ============================================
DROP POLICY IF EXISTS "User books are viewable by everyone" ON user_books;
CREATE POLICY "User books are viewable by everyone"
  ON user_books FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can manage own books" ON user_books;
CREATE POLICY "Users can manage own books"
  ON user_books FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- 16. POLITIQUES RLS - activities
-- ============================================
DROP POLICY IF EXISTS "Activities are viewable by everyone" ON activities;
CREATE POLICY "Activities are viewable by everyone"
  ON activities FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can manage own activities" ON activities;
CREATE POLICY "Users can manage own activities"
  ON activities FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- 17. POLITIQUES RLS - follows
-- ============================================
DROP POLICY IF EXISTS "Follows are viewable by everyone" ON follows;
CREATE POLICY "Follows are viewable by everyone"
  ON follows FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can manage own follows" ON follows;
CREATE POLICY "Users can manage own follows"
  ON follows FOR ALL USING (auth.uid() = follower_id);

-- ============================================
-- 18. POLITIQUES RLS - notifications
-- ============================================
DROP POLICY IF EXISTS "Users can read own notifications" ON notifications;
CREATE POLICY "Users can read own notifications"
  ON notifications FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Allow notification inserts" ON notifications;
CREATE POLICY "Allow notification inserts"
  ON notifications FOR INSERT WITH CHECK (true);

-- ============================================
-- 19. POLITIQUES RLS - activity_reactions
-- ============================================
DROP POLICY IF EXISTS "Reactions are viewable by everyone" ON activity_reactions;
CREATE POLICY "Reactions are viewable by everyone"
  ON activity_reactions FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can manage own reactions" ON activity_reactions;
CREATE POLICY "Users can manage own reactions"
  ON activity_reactions FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- 20. POLITIQUES RLS - activity_comments
-- ============================================
DROP POLICY IF EXISTS "Comments are viewable by everyone" ON activity_comments;
CREATE POLICY "Comments are viewable by everyone"
  ON activity_comments FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can manage own comments" ON activity_comments;
CREATE POLICY "Users can manage own comments"
  ON activity_comments FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- 21. POLITIQUES RLS - user_goals
-- ============================================
DROP POLICY IF EXISTS "Users can read own goals" ON user_goals;
CREATE POLICY "Users can read own goals"
  ON user_goals FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage own goals" ON user_goals;
CREATE POLICY "Users can manage own goals"
  ON user_goals FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- 22. POLITIQUES RLS - clubs
-- ============================================
DROP POLICY IF EXISTS "Clubs are viewable by everyone" ON clubs;
CREATE POLICY "Clubs are viewable by everyone"
  ON clubs FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can create clubs" ON clubs;
CREATE POLICY "Users can create clubs"
  ON clubs FOR INSERT WITH CHECK (auth.uid() = creator_id);

DROP POLICY IF EXISTS "Creators can update own clubs" ON clubs;
CREATE POLICY "Creators can update own clubs"
  ON clubs FOR UPDATE USING (auth.uid() = creator_id);

-- ============================================
-- 23. POLITIQUES RLS - club_members
-- ============================================
DROP POLICY IF EXISTS "Club members are viewable by everyone" ON club_members;
CREATE POLICY "Club members are viewable by everyone"
  ON club_members FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can manage own memberships" ON club_members;
CREATE POLICY "Users can manage own memberships"
  ON club_members FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- 24. FONCTION pour créer automatiquement un profil utilisateur
-- ============================================
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

-- ============================================
-- 25. TRIGGER pour créer automatiquement un profil à l'inscription
-- ============================================
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- 26. FONCTION pour créer une notification de follow
-- ============================================
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

-- ============================================
-- 27. TRIGGER pour créer une notification quand quelqu'un suit
-- ============================================
DROP TRIGGER IF EXISTS on_follow_create_notification ON follows;
CREATE TRIGGER on_follow_create_notification
  AFTER INSERT ON follows
  FOR EACH ROW
  EXECUTE FUNCTION create_follow_notification();

-- ============================================
-- 28. VÉRIFICATION FINALE
-- ============================================
SELECT 
  '✅ Setup terminé avec succès!' as message,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public') as total_tables;










