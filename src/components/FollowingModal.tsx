import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { LevelBadge } from '../components/LevelProgressBar';
import { useScrollLock } from '../hooks/useScrollLock';

interface FollowingModalProps {
  userId: string;
  onClose: () => void;
  onUserClick: (userId: string) => void;
}

export function FollowingModal({ userId, onClose, onUserClick }: FollowingModalProps) {
  const [following, setFollowing] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    loadFollowing();
  }, [userId]);

  const loadFollowing = async () => {
    setLoading(true);

    // Récupérer les following (ceux que cet utilisateur suit)
    const { data: follows, error: followsError } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', userId);

    if (followsError) {
      console.error('=== FOLLOWS ERROR (FollowingModal) ===');
      console.error('Full error:', followsError);
      console.error('Message:', followsError.message);
      console.error('Details:', followsError.details);
      console.error('Hint:', followsError.hint);
      console.error('Code:', followsError.code);
      console.error('Query:', `follows?select=following_id&follower_id=eq.${userId}`);
    }

    if (follows && follows.length > 0) {
      const followingIds = follows.map((f) => f.following_id);

      // Récupérer les profils des following
      const { data: profiles, error: profilesError } = await supabase
        .from('user_profiles')
        .select('id, display_name, username, avatar_url, bio, xp_total')
        .in('id', followingIds);

      if (profilesError) {
        console.error('=== USER_PROFILES ERROR (FollowingModal) ===');
        console.error('Full error:', profilesError);
        console.error('Message:', profilesError.message);
        console.error('Details:', profilesError.details);
        console.error('Hint:', profilesError.hint);
        console.error('Code:', profilesError.code);
      }

      if (profiles) {
        setFollowing(profiles);
      }
    } else {
      setFollowing([]);
    }

    setLoading(false);
  };

  useScrollLock(true);

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]" 
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
        className="bg-white rounded-3xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-shrink-0 bg-white border-b border-stone-200 px-6 py-4 flex items-center justify-between rounded-t-3xl">
          <h2 className="text-xl font-bold">Abonnements</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-stone-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="text-center py-12 text-text-sub-light">Chargement...</div>
          ) : following.length === 0 ? (
            <div className="text-center py-12 text-text-sub-light">
              <p className="text-lg font-medium text-text-main-light mb-2">Aucun abonnement</p>
              <p className="text-sm">Les personnes que vous suivez apparaîtront ici</p>
            </div>
          ) : (
            <div className="space-y-2">
              {following.map((profile) => (
                <button
                  key={profile.id}
                  onClick={() => {
                    onUserClick(profile.id);
                    onClose();
                  }}
                  className="w-full flex items-center gap-3 p-4 rounded-xl hover:bg-stone-50 transition-colors text-left"
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
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-stone-900">{profile.display_name}</h3>
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


