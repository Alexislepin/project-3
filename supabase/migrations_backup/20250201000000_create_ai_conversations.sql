-- Create ai_conversations table
CREATE TABLE IF NOT EXISTS public.ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_key text NOT NULL,
  title text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create ai_messages table
CREATE TABLE IF NOT EXISTS public.ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content text NOT NULL,
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_book_updated 
  ON public.ai_conversations(user_id, book_key, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation_created 
  ON public.ai_messages(conversation_id, created_at ASC);

-- Enable RLS
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;

-- RLS policies for ai_conversations
CREATE POLICY "Users can view own conversations"
  ON public.ai_conversations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own conversations"
  ON public.ai_conversations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own conversations"
  ON public.ai_conversations FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own conversations"
  ON public.ai_conversations FOR DELETE
  USING (auth.uid() = user_id);

-- RLS policies for ai_messages
CREATE POLICY "Users can view own messages"
  ON public.ai_messages FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own messages"
  ON public.ai_messages FOR INSERT
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM public.ai_conversations
      WHERE id = conversation_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own messages"
  ON public.ai_messages FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own messages"
  ON public.ai_messages FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger to update updated_at on ai_conversations
CREATE OR REPLACE FUNCTION update_ai_conversations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_ai_conversations_updated_at_trigger
  BEFORE UPDATE ON public.ai_conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_ai_conversations_updated_at();

-- Trigger to update updated_at on ai_conversations when a message is inserted
CREATE OR REPLACE FUNCTION update_ai_conversation_on_message_insert()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.ai_conversations
  SET updated_at = now()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_ai_conversation_on_message_insert_trigger
  AFTER INSERT ON public.ai_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_ai_conversation_on_message_insert();

