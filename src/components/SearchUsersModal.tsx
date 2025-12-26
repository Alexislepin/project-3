import { useState } from 'react';
import { X, Search, UserPlus, UserCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface SearchUsersModalProps {
  onClose: () => void;
  onUserClick?: (userId: string) => void;
}

export function SearchUsersModal({ onClose, onUserClick }: SearchUsersModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [followingIds, setFollowingIds] = useState<string[]>([]);
  const { user } = useAuth();

  const handleSearch = async (query: string) => {
    setSearchQuery(query);

    if (query.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    setSearching(true);

    const { data: users } = await supabase
      .from('user_profiles')
      .select('id, display_name, username, avatar_url, bio')
      .neq('id', user?.id || '')
      .or(`display_name.ilike.%${query}%,username.ilike.%${query}%`)
      .limit(20);

    if (users) {
      setSearchResults(users);

      const { data: follows } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', user?.id || '');

      if (follows) {
        setFollowingIds(follows.map((f) => f.following_id));
      }
    }

    setSearching(false);
  };

  const handleFollow = async (userId: string) => {
    if (!user) return;

    const isFollowing = followingIds.includes(userId);

    if (isFollowing) {
      await supabase
        .from('follows')
        .delete()
        .eq('follower_id', user.id)
        .eq('following_id', userId);

      setFollowingIds(followingIds.filter((id) => id !== userId));
    } else {
      const { error: followError } = await supabase.from('follows').insert({
        follower_id: user.id,
        following_id: userId,
      });

      if (followError) {
        console.error('Erreur lors du follow:', followError);
      } else {
        // La notification sera créée automatiquement par le trigger create_follow_notification()
        setFollowingIds([...followingIds, userId]);
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end justify-center z-[150]" onClick={onClose}>
      <div
        className="bg-white rounded-t-3xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-shrink-0 bg-white border-b border-stone-200 px-6 py-4 flex items-center justify-between rounded-t-3xl">
          <h2 className="text-xl font-bold">Trouver des amis</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-stone-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
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
                    className="flex items-center gap-3 p-4 rounded-xl hover:bg-stone-50 transition-colors"
                  >
                    <div
                      onClick={handleProfileClick}
                      className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
                    >
                      <div className="w-12 h-12 bg-stone-200 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden">
                        {profile.avatar_url ? (
                          <img
                            src={profile.avatar_url}
                            alt={profile.display_name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-lg font-bold text-stone-600">
                            {profile.display_name.charAt(0).toUpperCase()}
                          </span>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-stone-900">{profile.display_name}</h3>
                        <p className="text-sm text-stone-500">@{profile.username}</p>
                        {profile.bio && (
                          <p className="text-sm text-stone-600 mt-1 line-clamp-1">{profile.bio}</p>
                        )}
                      </div>
                    </div>

                    <button
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
            </div>
          )}

          {!searchQuery && (
            <div className="text-center py-12">
              <Search className="w-16 h-16 mx-auto mb-4 text-text-sub-light" />
              <p className="text-lg font-medium text-text-main-light mb-2">Rechercher des amis</p>
              <p className="text-sm text-text-sub-light">
                Entrez un nom ou un nom d'utilisateur pour commencer
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
