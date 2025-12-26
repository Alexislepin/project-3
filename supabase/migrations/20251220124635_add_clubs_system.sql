/*
  # Add Clubs System

  1. New Tables
    - `clubs`
      - `id` (uuid, primary key)
      - `name` (text, club name)
      - `description` (text, club description)
      - `category` (text, club category like 'Fiction', 'Non-fiction', etc.)
      - `is_private` (boolean, whether club is private or public)
      - `creator_id` (uuid, references user_profiles)
      - `member_count` (integer, number of members)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `club_members`
      - `id` (uuid, primary key)
      - `club_id` (uuid, references clubs)
      - `user_id` (uuid, references user_profiles)
      - `role` (text, 'admin', 'moderator', or 'member')
      - `joined_at` (timestamptz)
      - Unique constraint on (club_id, user_id)
  
  2. Security
    - Enable RLS on both tables
    - Clubs: Anyone authenticated can read public clubs, creators can update their clubs
    - Club members: Anyone authenticated can read memberships, users can insert/delete their own memberships
  
  3. Functions
    - Trigger to automatically add creator as admin when club is created
    - Trigger to update member_count when members join/leave
*/

-- Create clubs table
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

-- Create club_members table
CREATE TABLE IF NOT EXISTS club_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid REFERENCES clubs(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES user_profiles(id) ON DELETE CASCADE NOT NULL,
  role text DEFAULT 'member' CHECK (role IN ('admin', 'moderator', 'member')),
  joined_at timestamptz DEFAULT now(),
  UNIQUE(club_id, user_id)
);

-- Enable RLS
ALTER TABLE clubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE club_members ENABLE ROW LEVEL SECURITY;

-- RLS Policies for clubs
CREATE POLICY "Anyone can view public clubs"
  ON clubs FOR SELECT
  TO authenticated
  USING (NOT is_private OR creator_id = auth.uid() OR EXISTS (
    SELECT 1 FROM club_members
    WHERE club_members.club_id = clubs.id
    AND club_members.user_id = auth.uid()
  ));

CREATE POLICY "Authenticated users can create clubs"
  ON clubs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "Club creators can update their clubs"
  ON clubs FOR UPDATE
  TO authenticated
  USING (creator_id = auth.uid())
  WITH CHECK (creator_id = auth.uid());

CREATE POLICY "Club creators can delete their clubs"
  ON clubs FOR DELETE
  TO authenticated
  USING (creator_id = auth.uid());

-- RLS Policies for club_members
CREATE POLICY "Anyone can view club memberships"
  ON club_members FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can join clubs"
  ON club_members FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can leave clubs or admins can remove members"
  ON club_members FOR DELETE
  TO authenticated
  USING (
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM club_members cm
      WHERE cm.club_id = club_members.club_id
      AND cm.user_id = auth.uid()
      AND cm.role = 'admin'
    )
  );

-- Function to add creator as admin when club is created
CREATE OR REPLACE FUNCTION add_creator_as_admin()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO club_members (club_id, user_id, role)
  VALUES (NEW.id, NEW.creator_id, 'admin');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to add creator as admin
DROP TRIGGER IF EXISTS on_club_created ON clubs;
CREATE TRIGGER on_club_created
  AFTER INSERT ON clubs
  FOR EACH ROW
  EXECUTE FUNCTION add_creator_as_admin();

-- Function to update member count
CREATE OR REPLACE FUNCTION update_club_member_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE clubs
    SET member_count = member_count + 1
    WHERE id = NEW.club_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE clubs
    SET member_count = GREATEST(member_count - 1, 0)
    WHERE id = OLD.club_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update member count
DROP TRIGGER IF EXISTS on_club_member_change ON club_members;
CREATE TRIGGER on_club_member_change
  AFTER INSERT OR DELETE ON club_members
  FOR EACH ROW
  EXECUTE FUNCTION update_club_member_count();

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_clubs_creator_id ON clubs(creator_id);
CREATE INDEX IF NOT EXISTS idx_clubs_category ON clubs(category);
CREATE INDEX IF NOT EXISTS idx_club_members_club_id ON club_members(club_id);
CREATE INDEX IF NOT EXISTS idx_club_members_user_id ON club_members(user_id);
