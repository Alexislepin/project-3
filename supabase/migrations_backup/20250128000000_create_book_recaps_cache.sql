-- Table de cache pour les recaps générés
CREATE TABLE IF NOT EXISTS book_recaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id UUID REFERENCES books(id) ON DELETE CASCADE,
  book_key TEXT, -- Pour les livres OpenLibrary (ex: "/works/OL123W")
  isbn TEXT,
  upto_page INTEGER NOT NULL DEFAULT 0,
  language TEXT NOT NULL DEFAULT 'fr',
  
  -- Contenu du recap (JSONB pour flexibilité)
  recap_data JSONB NOT NULL,
  
  -- Métadonnées
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Index pour recherche rapide
  CONSTRAINT book_recaps_user_book_check CHECK (
    (book_id IS NOT NULL) OR (book_key IS NOT NULL) OR (isbn IS NOT NULL)
  )
);

  -- Index pour recherche rapide par user + book + upto_page + language
CREATE INDEX IF NOT EXISTS idx_book_recaps_lookup ON book_recaps(
  user_id,
  COALESCE(book_id::TEXT, ''),
  COALESCE(book_key, ''),
  COALESCE(isbn, ''),
  upto_page,
  language
);

-- Contrainte unique pour permettre upsert (user + book identifier + upto_page + language)
-- On utilise une expression unique qui gère les NULLs
CREATE UNIQUE INDEX IF NOT EXISTS idx_book_recaps_unique ON book_recaps(
  user_id,
  COALESCE(book_id::TEXT, ''),
  COALESCE(book_key, ''),
  COALESCE(isbn, ''),
  upto_page,
  language
);

-- Index pour cleanup (supprimer les vieux recaps)
CREATE INDEX IF NOT EXISTS idx_book_recaps_created_at ON book_recaps(created_at);

-- RLS: users can only see their own recaps
ALTER TABLE book_recaps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own recaps"
  ON book_recaps FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own recaps"
  ON book_recaps FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own recaps"
  ON book_recaps FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own recaps"
  ON book_recaps FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger pour updated_at
CREATE OR REPLACE FUNCTION update_book_recaps_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER book_recaps_updated_at
  BEFORE UPDATE ON book_recaps
  FOR EACH ROW
  EXECUTE FUNCTION update_book_recaps_updated_at();

