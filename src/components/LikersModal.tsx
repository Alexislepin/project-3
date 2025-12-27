import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { X } from 'lucide-react';

export function LikersModal({
  activityId,
  onClose,
  onUserClick,
}: {
  activityId: string;
  onClose: () => void;
  onUserClick?: (userId: string) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [likers, setLikers] = useState<any[]>([]);

  useEffect(() => {
    const run = async () => {
      setLoading(true);

      const { data, error } = await supabase
        .from('activity_reactions')
        .select('user_id, created_at, user_profiles!activity_reactions_user_id_fkey(id, display_name, username, avatar_url)')
        .eq('activity_id', activityId)
        .order('created_at', { ascending: false });

      if (error) console.error('[LikersModal] error', error);
      setLikers((data || []).map((r: any) => r.user_profiles).filter(Boolean));
      setLoading(false);
    };
    run();
  }, [activityId]);

  return (
    <div 
      className="fixed inset-0 z-[350] bg-black/30 flex items-end justify-center"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-2xl bg-white rounded-t-2xl shadow-xl flex flex-col"
        style={{
          maxHeight: 'calc(100vh - env(safe-area-inset-top) - env(safe-area-inset-bottom))',
          marginBottom: 0,
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div className="font-semibold">Likes</div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-black/5">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div 
          className="flex-1 overflow-y-auto"
          style={{
            paddingBottom: 'calc(16px + env(safe-area-inset-bottom))',
          }}
        >
          {loading ? (
            <div className="py-10 text-center text-stone-500">Chargement…</div>
          ) : likers.length === 0 ? (
            <div className="py-10 text-center text-stone-500">Aucun like</div>
          ) : (
            <div className="p-2">
              {likers.map((u) => (
                <button
                  key={u.id}
                  onClick={() => onUserClick?.(u.id)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-black/5 transition-colors"
                >
                  <div className="w-9 h-9 bg-stone-200 rounded-full flex items-center justify-center text-stone-600 font-medium flex-shrink-0 overflow-hidden">
                    {u.avatar_url ? (
                      <img
                        src={u.avatar_url}
                        alt={u.display_name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      (u.display_name || 'U').charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="text-left flex-1 min-w-0">
                    <div className="font-semibold text-sm text-stone-900 truncate">{u.display_name || 'Utilisateur'}</div>
                    <div className="text-xs text-stone-500 truncate">@{u.username || ''}</div>
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

