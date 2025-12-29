-- Migration: Ajouter book_key TEXT aux tables sociales pour mapper avec OpenLibrary IDs
-- À exécuter dans Supabase SQL Editor

-- 1) Ajouter colonne book_key à book_likes (nullable temporairement)
ALTER TABLE public.book_likes
ADD COLUMN IF NOT EXISTS book_key TEXT;

-- 2) Ajouter colonne book_key à book_comments (nullable temporairement)
ALTER TABLE public.book_comments
ADD COLUMN IF NOT EXISTS book_key TEXT;

-- 3) Backfill: remplir book_key avec book_id::text pour les données existantes
UPDATE public.book_likes
SET book_key = book_id::text
WHERE book_key IS NULL AND book_id IS NOT NULL;

UPDATE public.book_comments
SET book_key = book_id::text
WHERE book_key IS NULL AND book_id IS NOT NULL;

-- 4) Rendre book_key NOT NULL après le backfill
ALTER TABLE public.book_likes
ALTER COLUMN book_key SET NOT NULL;

ALTER TABLE public.book_comments
ALTER COLUMN book_key SET NOT NULL;

-- 5) Supprimer l'ancien unique constraint sur (user_id, book_id) si existe
ALTER TABLE public.book_likes
DROP CONSTRAINT IF EXISTS book_likes_user_id_book_id_key;

-- 6) Créer nouveau unique constraint sur (user_id, book_key)
ALTER TABLE public.book_likes
ADD CONSTRAINT book_likes_user_id_book_key_key UNIQUE (user_id, book_key);

-- 7) Créer index sur book_key pour book_likes
CREATE INDEX IF NOT EXISTS idx_book_likes_book_key ON public.book_likes(book_key);

-- 8) Créer index sur book_key pour book_comments
CREATE INDEX IF NOT EXISTS idx_book_comments_book_key ON public.book_comments(book_key);

-- Commentaires
COMMENT ON COLUMN public.book_likes.book_key IS 'Clé texte unique du livre (ex: ol:/works/OLxxxxxW ou UUID)';
COMMENT ON COLUMN public.book_comments.book_key IS 'Clé texte unique du livre (ex: ol:/works/OLxxxxxW ou UUID)';
