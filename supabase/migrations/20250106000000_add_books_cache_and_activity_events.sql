-- Migration: Créer books_cache et activity_events pour le feed d'activités

-- 1) Créer table books_cache pour le rendu rapide
CREATE TABLE IF NOT EXISTS public.books_cache (
  book_key TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT,
  cover_url TEXT,
  isbn TEXT,
  source TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index pour les recherches
CREATE INDEX IF NOT EXISTS idx_books_cache_book_key ON public.books_cache(book_key);
CREATE INDEX IF NOT EXISTS idx_books_cache_updated_at ON public.books_cache(updated_at DESC);

-- Commentaire
COMMENT ON TABLE public.books_cache IS 'Cache des informations de livres pour le rendu rapide du feed';

-- 2) Créer table activity_events pour le feed d'activités
CREATE TABLE IF NOT EXISTS public.activity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('like', 'comment')),
  book_key TEXT NOT NULL,
  comment_id UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes pour les performances
CREATE INDEX IF NOT EXISTS idx_activity_events_created_at ON public.activity_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_events_actor_created ON public.activity_events(actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_events_book_key ON public.activity_events(book_key);

-- Contrainte unique pour éviter les doublons de likes (un utilisateur ne peut liker qu'une fois par livre)
-- On permet les doublons pour les commentaires (un utilisateur peut commenter plusieurs fois)
CREATE UNIQUE INDEX IF NOT EXISTS activity_events_unique_like 
ON public.activity_events(actor_user_id, event_type, book_key) 
WHERE event_type = 'like';

-- Commentaires
COMMENT ON TABLE public.activity_events IS 'Événements d''activité pour le feed (likes et commentaires)';
COMMENT ON COLUMN public.activity_events.actor_user_id IS 'ID de l''utilisateur qui a effectué l''action';
COMMENT ON COLUMN public.activity_events.event_type IS 'Type d''événement: like ou comment';
COMMENT ON COLUMN public.activity_events.book_key IS 'Clé du livre (peut être UUID, OpenLibrary key, ISBN, etc.)';
COMMENT ON COLUMN public.activity_events.comment_id IS 'ID du commentaire (null pour les likes)';

-- 3) Activer RLS sur activity_events
ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;

-- Policy: Les utilisateurs authentifiés peuvent lire tous les événements
CREATE POLICY "activity_events_read_all_authenticated"
ON public.activity_events
FOR SELECT
TO authenticated
USING (true);

-- Policy: Les utilisateurs peuvent insérer leurs propres événements
CREATE POLICY "activity_events_insert_own"
ON public.activity_events
FOR INSERT
TO authenticated
WITH CHECK (actor_user_id = auth.uid());

-- Policy: Les utilisateurs peuvent supprimer leurs propres événements
CREATE POLICY "activity_events_delete_own"
ON public.activity_events
FOR DELETE
TO authenticated
USING (actor_user_id = auth.uid());

-- 4) RLS sur books_cache (lecture publique, écriture authentifiée)
ALTER TABLE public.books_cache ENABLE ROW LEVEL SECURITY;

-- Policy: Tout le monde peut lire books_cache
CREATE POLICY "books_cache_read_all"
ON public.books_cache
FOR SELECT
TO authenticated
USING (true);

-- Policy: Les utilisateurs authentifiés peuvent insérer/mettre à jour
CREATE POLICY "books_cache_upsert_authenticated"
ON public.books_cache
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

