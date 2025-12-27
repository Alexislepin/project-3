import { useState, useEffect } from 'react';
import { X, Trophy } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { LevelBadge } from './LevelProgressBar';
import { getLevelFromXp } from '../lib/leveling';

interface LeaderboardModalProps {
  onClose: () => void;
  onUserClick?: (userId: string) => void;
}

interface LeaderboardUser {
  id: string;
  username: string;
  display_name: string;
  avatar_url?: string;
  xp_total: number;
}

export function LeaderboardModal({ onClose, onUserClick }: LeaderboardModalProps) {
  const [users, setUsers] = useState<LeaderboardUser[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const currentUserRank = users.findIndex((u) => u.id === user?.id) + 1;
  const isCurrentUserFirst = currentUserRank === 1;

  useEffect(() => {
    loadLeaderboard();
  }, []);

  const loadLeaderboard = async () => {
    setLoading(true);

    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, username, display_name, avatar_url, xp_total')
        .order('xp_total', { ascending: false })
        .limit(100);

      if (error) {
        console.error('[Leaderboard] Error:', error);
        setUsers([]);
      } else {
        setUsers(data || []);
      }
    } catch (error) {
      console.error('[Leaderboard] Exception:', error);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  const getRankEmoji = (rank: number) => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return `#${rank}`;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end justify-center z-[100]" onClick={onClose}>
      <div
        className="bg-white rounded-t-3xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-shrink-0 bg-white border-b border-stone-200 px-6 py-4 flex items-center justify-between rounded-t-3xl">
          <div className="flex items-center gap-2">
            <Trophy className="w-6 h-6 text-primary" />
            <h2 className="text-xl font-bold">Classement XP</h2>
          </div>
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
          ) : users.length === 0 ? (
            <div className="text-center py-12 text-text-sub-light">
              <p className="text-lg font-medium text-text-main-light mb-2">Aucun classement disponible</p>
              <p className="text-sm">Les utilisateurs apparaîtront ici une fois qu'ils auront gagné des points</p>
            </div>
          ) : (
            <div className="space-y-2">
              {users.map((profile, index) => {
                const rank = index + 1;
                const isCurrentUser = user?.id === profile.id;
                const isFirstPlace = rank === 1;
                const level = getLevelFromXp(profile.xp_total || 0);

                return (
                  <button
                    key={profile.id}
                    onClick={() => {
                      if (onUserClick) {
                        onUserClick(profile.id);
                      }
                      onClose();
                    }}
                    className={`w-full flex items-center gap-3 p-4 rounded-2xl transition-colors text-left ${
                      isFirstPlace
                        ? 'bg-amber-50/60 border-2 border-amber-300/40 shadow-sm'
                        : isCurrentUser
                        ? 'bg-primary/10 border-2 border-primary'
                        : 'hover:bg-stone-50 border border-transparent'
                    }`}
                  >
                    {/* Rank */}
                    <div className="flex-shrink-0 w-10 text-center">
                      {isFirstPlace ? (
                        <span className="text-xl">🥇</span>
                      ) : (
                        <span className="text-lg font-bold text-text-main-light">
                          {getRankEmoji(rank)}
                        </span>
                      )}
                    </div>

                    {/* Avatar */}
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

                    {/* User info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-stone-900">{profile.display_name}</h3>
                        <LevelBadge xpTotal={profile.xp_total || 0} />
                        {isCurrentUser && (
                          <span className="text-xs font-medium text-primary">(Vous)</span>
                        )}
                      </div>
                      <p className="text-sm text-stone-500">@{profile.username}</p>
                    </div>

                    {/* XP */}
                    <div className="flex-shrink-0 text-right">
                      <p className="text-lg font-bold text-text-main-light">
                        {profile.xp_total?.toLocaleString() || 0}
                      </p>
                      <p className="text-xs text-text-sub-light">XP</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

