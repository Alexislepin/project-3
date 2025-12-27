import { supabase } from './supabase';

export interface AIConversation {
  id: string;
  user_id: string;
  book_key: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export interface AIMessage {
  id: string;
  conversation_id: string;
  user_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  meta: any | null;
  created_at: string;
}

/**
 * Load conversations for a book
 */
export async function loadConversations(
  userId: string,
  bookKey: string
): Promise<AIConversation[]> {
  const { data, error } = await supabase
    .from('ai_conversations')
    .select('*')
    .eq('user_id', userId)
    .eq('book_key', bookKey)
    .order('updated_at', { ascending: false })
    .limit(20);

  if (error) {
    console.error('[loadConversations] Error:', error);
    return [];
  }

  return data || [];
}

/**
 * Create a new conversation
 */
export async function createConversation(
  userId: string,
  bookKey: string,
  title?: string
): Promise<AIConversation | null> {
  const { data, error } = await supabase
    .from('ai_conversations')
    .insert({
      user_id: userId,
      book_key: bookKey,
      title: title || null,
    })
    .select()
    .single();

  if (error) {
    console.error('[createConversation] Error:', error);
    return null;
  }

  return data;
}

/**
 * Load messages for a conversation
 */
export async function loadMessages(
  conversationId: string
): Promise<AIMessage[]> {
  const { data, error } = await supabase
    .from('ai_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[loadMessages] Error:', error);
    return [];
  }

  return data || [];
}

/**
 * Add a message to a conversation
 */
export async function addMessage(
  conversationId: string,
  userId: string,
  role: 'user' | 'assistant' | 'system',
  content: string,
  meta?: any
): Promise<AIMessage | null> {
  const { data, error } = await supabase
    .from('ai_messages')
    .insert({
      conversation_id: conversationId,
      user_id: userId,
      role,
      content,
      meta: meta || null,
    })
    .select()
    .single();

  if (error) {
    console.error('[addMessage] Error:', error);
    return null;
  }

  // Update conversation updated_at
  await supabase
    .from('ai_conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', conversationId);

  return data;
}

/**
 * Update conversation title
 */
export async function updateConversationTitle(
  conversationId: string,
  title: string
): Promise<boolean> {
  const { error } = await supabase
    .from('ai_conversations')
    .update({ title })
    .eq('id', conversationId);

  if (error) {
    console.error('[updateConversationTitle] Error:', error);
    return false;
  }

  return true;
}

/**
 * Delete a conversation (cascades to messages)
 */
export async function deleteConversation(
  conversationId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('ai_conversations')
    .delete()
    .eq('id', conversationId);

  if (error) {
    console.error('[deleteConversation] Error:', error);
    return false;
  }

  return true;
}

