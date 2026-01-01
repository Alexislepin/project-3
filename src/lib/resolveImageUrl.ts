import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Resolve avatar URL from database value (path or URL)
 * Rejects local URIs (file://, capacitor://)
 * @param input - Database value (storage path or URL)
 * @param supabase - Supabase client instance
 * @returns Resolved public URL or null
 */
export function resolveAvatarUrl(
  input: string | null | undefined,
  supabase: SupabaseClient
): string | null {
  if (!input) return null;
  
  // Reject local URIs - these should never be stored in DB
  if (input.startsWith('file://') || input.startsWith('capacitor://')) {
    console.warn('[resolveAvatarUrl] Rejected local URI:', input);
    return null;
  }
  
  // If it's already an HTTP(S) URL, use it directly
  if (input.startsWith('http://') || input.startsWith('https://')) {
    return input;
  }
  
  // Otherwise, treat it as a storage path and resolve to public URL
  const { data } = supabase.storage.from('avatars').getPublicUrl(input);
  return data?.publicUrl || null;
}

/**
 * Add cache-buster query parameter to URL
 */
export function addCacheBuster(
  url: string | null,
  cacheKey?: string | number | null
): string | null {
  if (!url) return null;
  const key = cacheKey?.toString() || Date.now().toString();
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}v=${key}`;
}

