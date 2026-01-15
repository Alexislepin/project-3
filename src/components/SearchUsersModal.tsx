import { useEffect, useState } from 'react';
import { X, Search, UserPlus, UserCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useScrollLock } from '../hooks/useScrollLock';
import { resolveAvatarUrl, addCacheBuster } from '../lib/resolveImageUrl';

interface SearchUsersModalProps {
  onClose: () => void;
  onUserClick?: (userId: string) => void;
}

export function SearchUsersModal({ onClose, onUserClick }: SearchUsersModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [followingIds, setFollowingIds] = useState<string[]>([]);
  const [suggestedUsers, setSuggestedUsers] = useState<any[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(true);
  const { user } = useAuth();

  useScrollLock(true);

  const loadFollowing = async () => {
    if (!user?.id) return;
    const { data: follows, error } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', user.id);
    
    if (error) {
      console.error('Erreur chargement follows:', error);
      return;
    }
    
    if (follows) {
      console.log('[SearchUsersModal] Following IDs chargés:', follows.map((f) => f.following_id));
      setFollowingIds(follows.map((f) => f.following_id));
    }
  };

  const loadSuggestions = async () => {
    if (!user?.id) return;
    setLoadingSuggestions(true);
    const { data: users } = await supabase
      .from('user_profiles')
      .select('id, display_name, username, avatar_url, bio, updated_at')
      .neq('id', user.id)
      .order('updated_at', { ascending: false })
      .limit(12);
    if (users) {
      setSuggestedUsers(users);
    }
    setLoadingSuggestions(false);
  };

  useEffect(() => {
    loadFollowing();
    loadSuggestions();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = async (query: string) => {
    setSearchQuery(query);

    if (query.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    setSearching(true);

    const { data: users } = await supabase
      .from('user_profiles')
      .select('id, display_name, username, avatar_url, bio, updated_at')
      .neq('id', user?.id || '')
      .or(`display_name.ilike.%${query}%,username.ilike.%${query}%`)
      .limit(20);

    if (users) {
      setSearchResults(users);

      await loadFollowing();
    }

    setSearching(false);
  };

  const handleFollow = async (userId: string) => {
    if (!user || userId === user.id) return;

    const isFollowing = followingIds.includes(userId);

    const markFollowing = () => setFollowingIds((prev) => (prev.includes(userId) ? prev : [...prev, userId]));
    const markUnfollow = () => setFollowingIds((prev) => prev.filter((id) => id !== userId));
    const isDuplicateError = (err: any) =>
      err?.code === '23505' ||
      err?.details?.toLowerCase?.().includes('already exists') ||
      err?.message?.toLowerCase?.().includes('duplicate key') ||
      err?.hint?.toLowerCase?.().includes('already exists') ||
      err?.code === '409' ||
      err?.status === 409;

    if (isFollowing) {
      await supabase
        .from('follows')
        .delete()
        .eq('follower_id', user.id)
        .eq('following_id', userId);

      markUnfollow();
    } else {
      // Insert simple, on tolère les 409 (relation déjà existante)
      const { error: followError } = await supabase
        .from('follows')
        .insert({ follower_id: user.id, following_id: userId });

      if (followError && !isDuplicateError(followError)) {
        console.error('Erreur lors du follow:', followError);
        return;
      }

      // Notification (on ignore les doublons)
      await supabase.from('notifications').insert({
        user_id: userId,
        actor_id: user.id,
        type: 'follow',
        read: false,
        created_at: new Date().toISOString(),
      });

      markFollowing();
    }

    // Recharger l'état des follows depuis la DB pour avoir la vérité
    await loadFollowing();
  };

  return (
    <div 
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4 py-6"
      data-modal-overlay
      style={{ 
        paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))', 
        paddingTop: 'calc(1.5rem + env(safe-area-inset-top))' 
      }}
      onClick={onClose}
      onTouchMove={(e) => {
        // Prevent scroll on overlay
        const target = e.target as HTMLElement;
        if (!target.closest('[data-modal-content]')) {
          e.preventDefault();
        }
      }}
    >
      <div
        data-modal-content
        className="bg-white rounded-3xl w-full max-w-2xl flex flex-col overflow-hidden shadow-2xl"
        style={{
          maxHeight: 'calc(100vh - 160px)',
          marginTop: '32px',
          marginBottom: '48px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-shrink-0 bg-white border-b border-stone-200 px-6 py-4 flex items-center justify-between rounded-t-3xl">
          <h2 className="text-xl font-bold">Trouver des amis</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-stone-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div 
          className="flex-1 overflow-y-auto min-h-0 px-4 pt-3"
          style={{ 
            paddingBottom: 'calc(96px + env(safe-area-inset-bottom))',
            WebkitOverflowScrolling: 'touch',
            overscrollBehaviorY: 'contain',
            overscrollBehavior: 'contain',
            touchAction: 'pan-y',
          }}
        >
          <div className="mb-4 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-sub-light" />
            <input
              type="text"
              placeholder="Rechercher par nom ou @nom_utilisateur"
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              autoFocus
            />
          </div>

          {searching && (
            <div className="text-center py-12 text-text-sub-light">Recherche...</div>
          )}

          {!searching && searchQuery && searchResults.length === 0 && (
            <div className="text-center py-12 text-text-sub-light">
              Aucun utilisateur trouvé pour "{searchQuery}"
            </div>
          )}

          {!searching && searchResults.length > 0 && (
            <div className="space-y-2">
              {searchResults.map((profile) => {
                const isFollowing = followingIds.includes(profile.id);
                
                const handleProfileClick = (e?: React.MouseEvent) => {
                  if (e) {
                    e.preventDefault();
                    e.stopPropagation();
                  }
                  // Appeler onUserClick AVANT de fermer la modal
                  if (onUserClick) {
                    onUserClick(profile.id);
                  }
                  // Fermer la modal après
                  onClose();
                };
                
                return (
                  <div
                    key={profile.id}
                    className="flex items-center gap-3 p-4 rounded-2xl hover:bg-white/5 transition-colors"
                  >
                    <div
                      onClick={handleProfileClick}
                      className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
                    >
                  <div className="w-12 h-12 bg-stone-200 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {(() => {
                      const avatarUrl = resolveAvatarUrl(profile.avatar_url || null, supabase);
                      const bustedUrl = avatarUrl ? addCacheBuster(avatarUrl, profile.updated_at) : null;
                      const safeUrl = bustedUrl && (bustedUrl.startsWith('http://') || bustedUrl.startsWith('https://') || bustedUrl.startsWith('data:') || bustedUrl.startsWith('/')) ? bustedUrl : null;
                      return safeUrl ? (
                        <img
                          src={safeUrl}
                          alt={profile.display_name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-lg font-bold text-stone-600">
                          {profile.display_name.charAt(0).toUpperCase()}
                        </span>
                      );
                    })()}
                  </div>

                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-[rgb(var(--color-text))]">{profile.display_name}</h3>
                        <p className="text-sm text-stone-500">@{profile.username}</p>
                        {profile.bio && (
                          <p className="text-sm text-stone-600 mt-1 line-clamp-1">{profile.bio}</p>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleFollow(profile.id);
                      }}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-colors flex-shrink-0 ${
                        isFollowing
                          ? 'bg-stone-100 text-stone-900 hover:bg-stone-200'
                          : 'bg-primary text-black hover:brightness-95'
                      }`}
                    >
                      {isFollowing ? (
                        <>
                          <UserCheck className="w-4 h-4" />
                          Suivi
                        </>
                      ) : (
                        <>
                          <UserPlus className="w-4 h-4" />
                          Suivre
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
              {/* Spacer pour éviter que le dernier item soit caché par la tab bar */}
              <div className="h-6" />
            </div>
          )}

          {!searching && !searchQuery && (
            <div className="space-y-3">
              <div className="text-left">
                <p className="text-lg font-bold text-text-main-light">Vous les connaissez peut-être</p>
                <p className="text-sm text-text-sub-light">
                  Des lecteurs actifs récemment. Tu peux les suivre ou visiter leur profil.
                </p>
              </div>

              {loadingSuggestions ? (
                <div className="text-center py-8 text-text-sub-light">Chargement...</div>
              ) : suggestedUsers.length === 0 ? (
                <div className="text-center py-8 text-text-sub-light">
                  Aucun lecteur à suggérer pour le moment.
                </div>
              ) : (
                <div className="space-y-2">
                  {suggestedUsers.map((profile) => {
                    const isFollowing = followingIds.includes(profile.id);
                    const handleProfileClick = (e?: React.MouseEvent) => {
                      if (e) {
                        e.preventDefault();
                        e.stopPropagation();
                      }
                      if (onUserClick) {
                        onUserClick(profile.id);
                      }
                      onClose();
                    };

                    return (
                      <div
                        key={profile.id}
                        className="flex items-center gap-3 p-4 rounded-2xl hover:bg-white/5 transition-colors"
                      >
                        <div
                          onClick={handleProfileClick}
                          className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
                        >
                          <div className="w-12 h-12 bg-stone-200 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden">
                            {(() => {
                              const avatarUrl = resolveAvatarUrl(profile.avatar_url || null, supabase);
                              const bustedUrl = avatarUrl ? addCacheBuster(avatarUrl, profile.updated_at) : null;
                              const safeUrl = bustedUrl && (bustedUrl.startsWith('http://') || bustedUrl.startsWith('https://') || bustedUrl.startsWith('data:') || bustedUrl.startsWith('/')) ? bustedUrl : null;
                              return safeUrl ? (
                                <img
                                  src={safeUrl}
                                  alt={profile.display_name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <span className="text-lg font-bold text-stone-600">
                                  {profile.display_name?.charAt(0)?.toUpperCase() || '?'}
                                </span>
                              );
                            })()}
                          </div>

                          <div className="flex-1 min-w-0">
                            <h3 className="font-bold text-[rgb(var(--color-text))]">{profile.display_name}</h3>
                            <p className="text-sm text-stone-500">@{profile.username}</p>
                            {profile.bio && (
                              <p className="text-sm text-stone-600 mt-1 line-clamp-1">{profile.bio}</p>
                            )}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleFollow(profile.id);
                          }}
                          className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-colors flex-shrink-0 ${
                            isFollowing
                              ? 'bg-stone-100 text-stone-900 hover:bg-stone-200'
                              : 'bg-primary text-black hover:brightness-95'
                          }`}
                        >
                          {isFollowing ? (
                            <>
                              <UserCheck className="w-4 h-4" />
                              Suivi
                            </>
                          ) : (
                            <>
                              <UserPlus className="w-4 h-4" />
                              Suivre
                            </>
                          )}
                        </button>
                      </div>
                    );
                  })}
                  <div className="h-6" />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
