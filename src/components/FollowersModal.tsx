import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { resolveAvatarUrl, addCacheBuster } from '../lib/resolveImageUrl';
import { LevelBadge } from '../components/LevelProgressBar';
import { useScrollLock } from '../hooks/useScrollLock';

interface FollowersModalProps {
  userId: string;
  onClose: () => void;
  onUserClick: (userId: string) => void;
}

export function FollowersModal({ userId, onClose, onUserClick }: FollowersModalProps) {
  const [followers, setFollowers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFollowers();
  }, [userId]);

  const loadFollowers = async () => {
    setLoading(true);

    // Récupérer les followers (ceux qui suivent cet utilisateur)
    const { data: follows, error: followsError } = await supabase
      .from('follows')
      .select('follower_id')
      .eq('following_id', userId);

    if (followsError) {
      console.error('=== FOLLOWS ERROR (FollowersModal) ===');
      console.error('Full error:', followsError);
      console.error('Message:', followsError.message);
      console.error('Details:', followsError.details);
      console.error('Hint:', followsError.hint);
      console.error('Code:', followsError.code);
      console.error('Query:', `follows?select=follower_id&following_id=eq.${userId}`);
    }

    if (follows && follows.length > 0) {
      const followerIds = follows.map((f) => f.follower_id);

      // Récupérer les profils des followers
      const { data: profiles, error: profilesError } = await supabase
        .from('user_profiles')
        .select('id, display_name, username, avatar_url, bio, xp_total')
        .in('id', followerIds);

      if (profilesError) {
        console.error('=== USER_PROFILES ERROR (FollowersModal) ===');
        console.error('Full error:', profilesError);
        console.error('Message:', profilesError.message);
        console.error('Details:', profilesError.details);
        console.error('Hint:', profilesError.hint);
        console.error('Code:', profilesError.code);
      }

      if (profiles) {
        setFollowers(profiles);
      }
    } else {
      setFollowers([]);
    }

    setLoading(false);
  };

  useScrollLock(true);

  return (
    <div 
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]" 
      data-modal-overlay
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
        className="bg-background-light rounded-3xl max-w-xl w-full flex flex-col overflow-hidden mx-4 shadow-2xl border border-gray-100 mb-6"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxHeight: 'calc(100vh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 180px)',
        }}
      >
        <div className="flex-shrink-0 bg-background-light border-b border-stone-200 px-6 py-4 flex items-center justify-between rounded-t-3xl">
          <h2 className="text-xl font-bold">Abonnés</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-stone-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div 
          className="flex-1 overflow-y-auto min-h-0 px-6 py-6"
          style={{
            WebkitOverflowScrolling: 'touch',
            paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 128px)',
          }}
        >
          {loading ? (
            <div className="text-center py-12 text-text-sub-light">Chargement...</div>
          ) : followers.length === 0 ? (
            <div className="text-center py-12 text-text-sub-light">
              <p className="text-lg font-medium text-text-main-light mb-2">Aucun abonné</p>
              <p className="text-sm">Les personnes qui vous suivent apparaîtront ici</p>
            </div>
          ) : (
            <div className="space-y-2">
              {followers.map((profile) => (
                <button
                  key={profile.id}
                  onClick={() => {
                    onUserClick(profile.id);
                    onClose();
                  }}
                  className="w-full flex items-center gap-3 p-4 rounded-xl hover:bg-surface-2 transition-colors text-left"
                >
                  <div className="w-12 h-12 bg-stone-200 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {(() => {
                      const avatarUrl = resolveAvatarUrl(profile.avatar_url || null, supabase);
                      const bustedUrl = addCacheBuster(avatarUrl, profile.updated_at);
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
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-text-main-light">{profile.display_name}</h3>
                      {profile.xp_total !== undefined && (
                        <LevelBadge xpTotal={profile.xp_total || 0} />
                      )}
                    </div>
                    <p className="text-sm text-stone-500">@{profile.username}</p>
                    {profile.bio && (
                      <p className="text-sm text-stone-600 mt-1 line-clamp-1">{profile.bio}</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


