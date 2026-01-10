import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Heart } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { candidateBookKeysFromBook } from '../lib/bookSocial';

interface BookLikersModalProps {
  bookKey: string;
  bookTitle: string;
  onClose: () => void;
  onUserClick?: (userId: string) => void;
}

interface BookLiker {
  user_id: string;
  username: string;
  avatar_url: string | null;
  liked_at: string;
  display_name?: string;
}

/**
 * Modal showing users who liked a book
 * Similar to Instagram/Strava "likes" modal
 */
export function BookLikersModal({ bookKey, bookTitle, onClose, onUserClick }: BookLikersModalProps) {
  const [likers, setLikers] = useState<BookLiker[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const pageRef = useRef(0); // Use ref to avoid stale closure issues

  const LIMIT = 50;

  const loadLikers = useCallback(async (reset: boolean = false) => {
    if (!bookKey || bookKey === 'unknown') {
      setLikers([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const currentPage = reset ? 0 : pageRef.current;
    const offset = currentPage * LIMIT;

    try {
      // CRITICAL: Use candidate keys to find all likes, even if stored with different key formats
      const candidateKeys = candidateBookKeysFromBook(bookKey);
      
      // Query directly from book_likes with all candidate keys, then join user_profiles
      const { data: likesData, error: likesError } = await supabase
        .from('book_likes')
        .select('user_id, created_at')
        .in('book_key', candidateKeys)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .range(offset, offset + LIMIT - 1);

      if (likesError) {
        console.error('[BookLikersModal] Error loading likes:', likesError);
        setLikers([]);
        setHasMore(false);
      } else if (likesData && likesData.length > 0) {
        // Get unique user IDs
        const userIds = Array.from(new Set(likesData.map((like: any) => like.user_id)));
        
        // Fetch user profiles
        const { data: profilesData, error: profilesError } = await supabase
          .from('user_profiles')
          .select('id, username, display_name, avatar_url')
          .in('id', userIds);

        if (profilesError) {
          console.error('[BookLikersModal] Error loading profiles:', profilesError);
          // Fallback: try RPC with canonical key
          const { data: rpcData, error: rpcError } = await supabase.rpc('get_book_likers', {
            p_book_key: bookKey,
            p_limit: LIMIT,
            p_offset: offset,
          });
          
          if (rpcError) {
            console.error('[BookLikersModal] RPC fallback error:', rpcError);
            setLikers([]);
            setHasMore(false);
          } else {
            const newLikers = (rpcData || []).map((item: any) => ({
              user_id: item.user_id,
              username: item.username,
              avatar_url: item.avatar_url,
              liked_at: item.liked_at,
              display_name: item.display_name,
            }));
            setLikers(prev => reset ? newLikers : [...prev, ...newLikers]);
            setHasMore(newLikers.length === LIMIT);
            pageRef.current = reset ? 1 : currentPage + 1;
          }
        } else {
          // Create a map of user profiles
          const profilesMap = new Map((profilesData || []).map((p: any) => [p.id, p]));
          
          // Transform the data: match likes with profiles
          const newLikers = likesData.map((like: any) => {
            const profile = profilesMap.get(like.user_id);
            return {
              user_id: like.user_id,
              username: profile?.username || 'user',
              avatar_url: profile?.avatar_url || null,
              liked_at: like.created_at,
              display_name: profile?.display_name || profile?.username || 'Utilisateur',
            };
          });
          
          setLikers(prev => reset ? newLikers : [...prev, ...newLikers]);
          setHasMore(newLikers.length === LIMIT);
          pageRef.current = reset ? 1 : currentPage + 1;
        }
      } else {
        // No likes found
        setLikers([]);
        setHasMore(false);
      }
    } catch (error) {
      console.error('[BookLikersModal] Unexpected error:', error);
      // Fallback: try RPC with canonical key
      try {
        const { data: rpcData, error: rpcError } = await supabase.rpc('get_book_likers', {
          p_book_key: bookKey,
          p_limit: LIMIT,
          p_offset: offset,
        });
        
        if (rpcError) {
          console.error('[BookLikersModal] RPC fallback error:', rpcError);
          setLikers([]);
          setHasMore(false);
        } else {
          const newLikers = (rpcData || []).map((item: any) => ({
            user_id: item.user_id,
            username: item.username,
            avatar_url: item.avatar_url,
            liked_at: item.liked_at,
            display_name: item.display_name,
          }));
          setLikers(prev => reset ? newLikers : [...prev, ...newLikers]);
          setHasMore(newLikers.length === LIMIT);
          pageRef.current = reset ? 1 : currentPage + 1;
        }
      } catch (rpcError) {
        console.error('[BookLikersModal] RPC fallback failed:', rpcError);
        setLikers([]);
        setHasMore(false);
      }
    } finally {
      setLoading(false);
    }
  }, [bookKey]);

  useEffect(() => {
    pageRef.current = 0; // Reset page when bookKey changes
    loadLikers(true);
  }, [bookKey, loadLikers]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4" onClick={onClose}>
      <div
        className="bg-white rounded-3xl w-[min(520px,92vw)] max-h-[calc(100vh-140px)] flex flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Fixed Header */}
        <div className="flex-shrink-0 bg-white border-b border-stone-200 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Heart className="w-6 h-6 text-red-600 fill-current" />
            <h2 className="text-xl font-bold">Personnes qui ont aimé</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-stone-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Book title */}
        <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
          <p className="text-sm text-text-sub-light line-clamp-2">{bookTitle}</p>
        </div>

        {/* Scrollable Likers list */}
        <div className="flex-1 overflow-y-auto px-4 pt-4 min-h-0">
          {loading && likers.length === 0 ? (
            <div className="text-center py-12 text-text-sub-light">Chargement...</div>
          ) : likers.length === 0 ? (
            <div className="text-center py-12 text-text-sub-light">
              <Heart className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p className="text-lg font-medium text-text-main-light mb-2">Aucun like pour le moment</p>
              <p className="text-sm">Les personnes qui aiment ce livre apparaîtront ici</p>
            </div>
          ) : (
            <div className="space-y-1 pb-4">
              {likers.map((liker) => (
                <button
                  key={liker.user_id}
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (onUserClick) {
                      onUserClick(liker.user_id);
                    }
                    onClose();
                  }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-stone-50 transition-colors text-left cursor-pointer"
                >
                  {/* Avatar */}
                  <div className="w-12 h-12 bg-stone-200 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {liker.avatar_url ? (
                      <img
                        src={liker.avatar_url}
                        alt={liker.username || 'User'}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-lg font-bold text-stone-600">
                        {(liker.display_name || liker.username || 'U').charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>

                  {/* User info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-stone-900 truncate">
                      {liker.display_name || liker.username || 'Utilisateur'}
                    </h3>
                    <p className="text-sm text-stone-500 truncate">@{liker.username || 'user'}</p>
                  </div>

                  {/* Liked at */}
                  <div className="flex-shrink-0 text-right">
                    <p className="text-xs text-text-sub-light">
                      {new Date(liker.liked_at).toLocaleDateString('fr-FR', {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </p>
                  </div>
                </button>
              ))}

              {/* Load more */}
              {hasMore && !loading && (
                <div className="py-4 text-center">
                  <button
                    onClick={() => loadLikers(false)}
                    disabled={loading}
                    className="text-sm text-primary font-medium hover:underline disabled:opacity-50"
                  >
                    Charger plus
                  </button>
                </div>
              )}
              {loading && likers.length > 0 && (
                <div className="py-4 text-center">
                  <span className="text-sm text-text-sub-light">Chargement...</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

