-- Table pour les likes de livres
CREATE TABLE IF NOT EXISTS book_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Un utilisateur ne peut liker un livre qu'une seule fois
  UNIQUE(user_id, book_id)
);

-- Index pour les requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_book_likes_book_id ON book_likes(book_id);
CREATE INDEX IF NOT EXISTS idx_book_likes_user_id ON book_likes(user_id);
CREATE INDEX IF NOT EXISTS idx_book_likes_created_at ON book_likes(created_at DESC);

-- Table pour les commentaires sur les livres
CREATE TABLE IF NOT EXISTS book_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) > 0 AND char_length(content) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index pour les requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_book_comments_book_id ON book_comments(book_id);
CREATE INDEX IF NOT EXISTS idx_book_comments_user_id ON book_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_book_comments_created_at ON book_comments(created_at DESC);

-- Trigger pour mettre à jour updated_at automatiquement
CREATE OR REPLACE FUNCTION update_book_comments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER book_comments_updated_at
  BEFORE UPDATE ON book_comments
  FOR EACH ROW
  EXECUTE FUNCTION update_book_comments_updated_at();

-- RLS pour book_likes
ALTER TABLE book_likes ENABLE ROW LEVEL SECURITY;

-- Tout le monde peut lire les likes
CREATE POLICY "Anyone can read book likes"
ON book_likes
FOR SELECT
TO authenticated
USING (true);

-- Seul l'utilisateur peut créer son propre like
CREATE POLICY "Users can insert their own likes"
ON book_likes
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Seul l'utilisateur peut supprimer son propre like
CREATE POLICY "Users can delete their own likes"
ON book_likes
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- RLS pour book_comments
ALTER TABLE book_comments ENABLE ROW LEVEL SECURITY;

-- Tout le monde peut lire les commentaires
CREATE POLICY "Anyone can read book comments"
ON book_comments
FOR SELECT
TO authenticated
USING (true);

-- Seul l'utilisateur peut créer son propre commentaire
CREATE POLICY "Users can insert their own comments"
ON book_comments
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Seul l'utilisateur peut modifier son propre commentaire
CREATE POLICY "Users can update their own comments"
ON book_comments
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Seul l'utilisateur peut supprimer son propre commentaire
CREATE POLICY "Users can delete their own comments"
ON book_comments
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

COMMENT ON TABLE book_likes IS 'Likes des utilisateurs sur les livres';
COMMENT ON TABLE book_comments IS 'Commentaires des utilisateurs sur les livres';

