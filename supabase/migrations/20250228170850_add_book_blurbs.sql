-- Table de cache pour les blurbs (résumés courts) de livres
CREATE TABLE IF NOT EXISTS public.book_blurbs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_key TEXT NOT NULL,   -- Clé stable: préférer OpenLibrary key normalisée `ol:/works/...` ou à défaut `isbn:<ISBN>`
  isbn TEXT,
  title TEXT,
  author TEXT,
  language TEXT NOT NULL DEFAULT 'fr',
  source TEXT NOT NULL DEFAULT 'openlibrary',  -- openlibrary | googlebooks | openai | deepl | mixed
  source_text TEXT,    -- Description brute source (avant traduction)
  blurb TEXT NOT NULL,      -- Résultat final court (2-3 lignes)
  status TEXT NOT NULL DEFAULT 'ready', -- ready | generating | error | no_data
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Contrainte unique: un seul blurb par book_key + language
  CONSTRAINT book_blurbs_book_key_language_unique UNIQUE (book_key, language)
);

-- Index unique pour l'upsert (utilisé par Supabase)
CREATE UNIQUE INDEX IF NOT EXISTS idx_book_blurbs_unique ON public.book_blurbs(book_key, language);
);

-- Index pour recherche rapide par book_key + language
CREATE INDEX IF NOT EXISTS idx_book_blurbs_lookup ON public.book_blurbs(book_key, language);

-- Index pour recherche par isbn (fallback)
CREATE INDEX IF NOT EXISTS idx_book_blurbs_isbn ON public.book_blurbs(isbn) WHERE isbn IS NOT NULL;

-- Index pour cleanup (supprimer les vieux blurbs)
CREATE INDEX IF NOT EXISTS idx_book_blurbs_created_at ON public.book_blurbs(created_at);

-- Trigger pour updated_at
CREATE OR REPLACE FUNCTION update_book_blurbs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER book_blurbs_updated_at
  BEFORE UPDATE ON public.book_blurbs
  FOR EACH ROW
  EXECUTE FUNCTION update_book_blurbs_updated_at();

-- RLS: Lecture publique, écriture uniquement via service_role (edge functions)
ALTER TABLE public.book_blurbs ENABLE ROW LEVEL SECURITY;

-- Policy SELECT: Lecture publique (ou authenticated)
CREATE POLICY "Anyone can read book blurbs"
  ON public.book_blurbs FOR SELECT
  USING (true);

-- Policy INSERT: Uniquement service_role (via edge functions)
-- On bloque INSERT côté client, l'upsert se fait dans l'Edge Function avec service key
CREATE POLICY "Service role can insert book blurbs"
  ON public.book_blurbs FOR INSERT
  WITH CHECK (false); -- Bloqué côté client, uniquement via service_role

-- Policy UPDATE: Uniquement service_role (via edge functions)
CREATE POLICY "Service role can update book blurbs"
  ON public.book_blurbs FOR UPDATE
  USING (false) -- Bloqué côté client, uniquement via service_role
  WITH CHECK (false);

-- Policy DELETE: Pas de suppression côté client (optionnel, pour cleanup manuel)
CREATE POLICY "No one can delete book blurbs"
  ON public.book_blurbs FOR DELETE
  USING (false);

