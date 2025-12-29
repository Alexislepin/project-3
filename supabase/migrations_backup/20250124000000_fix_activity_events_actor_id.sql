-- Migration: Fix activity_events column name
-- Le code utilise 'actor_id' mais la table a 'actor_user_id'
-- On renomme la colonne pour être cohérent avec le code

DO $$
BEGIN
  -- Vérifier si la colonne actor_user_id existe
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'activity_events' 
    AND column_name = 'actor_user_id'
  ) THEN
    -- Renommer actor_user_id en actor_id
    ALTER TABLE public.activity_events 
    RENAME COLUMN actor_user_id TO actor_id;
    
    -- Mettre à jour les index qui référencent actor_user_id
    DROP INDEX IF EXISTS idx_activity_events_actor_created;
    CREATE INDEX IF NOT EXISTS idx_activity_events_actor_created 
    ON public.activity_events(actor_id, created_at DESC);
    
    -- Mettre à jour l'index unique pour les likes
    DROP INDEX IF EXISTS activity_events_unique_like;
    CREATE UNIQUE INDEX IF NOT EXISTS activity_events_unique_like 
    ON public.activity_events(actor_id, event_type, book_key) 
    WHERE event_type = 'like';
    
    -- Mettre à jour les policies RLS
    DROP POLICY IF EXISTS "activity_events_insert_own" ON public.activity_events;
    CREATE POLICY "activity_events_insert_own"
    ON public.activity_events
    FOR INSERT
    TO authenticated
    WITH CHECK (actor_id = auth.uid());
    
    DROP POLICY IF EXISTS "activity_events_delete_own" ON public.activity_events;
    CREATE POLICY "activity_events_delete_own"
    ON public.activity_events
    FOR DELETE
    TO authenticated
    USING (actor_id = auth.uid());
  END IF;
  
  -- Si la colonne actor_id existe déjà, on ne fait rien (déjà corrigé)
END $$;

-- Mettre à jour les event_type pour correspondre au code (book_like, book_comment)
DO $$
BEGIN
  -- Vérifier si on a des anciens event_type 'like' ou 'comment'
  -- et les mettre à jour si nécessaire (optionnel, pour la cohérence)
  -- On laisse ça pour l'instant car le code utilise déjà 'book_like' et 'book_comment'
END $$;

