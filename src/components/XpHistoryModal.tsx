/**
 * XP History Modal
 * 
 * Displays a feed of all XP awards for the user with verdict and book information
 * Can be used for self profile or viewing other users' profiles
 */

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Trophy } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { formatXp } from '../lib/leveling';

interface XpEvent {
  id: string;
  created_at: string;
  xp_amount: number;
  verdict: 'correct' | 'partial' | 'incorrect';
  book_title: string | null;
  message: string;
  source: string;
}

interface XpHistoryItem {
  id: string;
  created_at: string;
  amount: number;
  source: string;
  description: string | null;
}

type XpItem = {
  id: string;
  created_at: string;
  amount: number;
  title: string;
  subtitle?: string | null;
  kind: 'reading' | 'challenge' | string;
};

interface XpHistoryModalProps {
  open: boolean;
  onClose: () => void;
  userId?: string; // If absent, uses auth user.id
  displayName?: string; // For personalizing messages (replaces "Tu")
  onAfterSyncXpTotal?: (newTotal: number) => void; // Optional callback after syncing XP
}

export function XpHistoryModal({ open, onClose, userId, displayName, onAfterSyncXpTotal }: XpHistoryModalProps) {
  const { user, refreshProfile } = useAuth();
  const [items, setItems] = useState<XpItem[]>([]);
  const [loading, setLoading] = useState(true);

  const targetUserId = userId ?? user?.id;

  // Simple scroll lock (no useScrollLock to avoid conflicts)
  useEffect(() => {
    if (!open) return;
    
    const prevOverflow = document.body.style.overflow;
    const prevTouch = document.body.style.touchAction;
    
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
    
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.touchAction = prevTouch;
    };
  }, [open]);

  useEffect(() => {
    if (open && targetUserId) {
      loadHistory();
      // Don't sync at open to avoid re-render loops
    } else if (!open) {
      setItems([]);
      // Sync on close only
      if (targetUserId) {
        syncXpTotal();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, targetUserId]);

  const syncXpTotal = async () => {
    if (!targetUserId) return;

    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('xp_total')
        .eq('id', targetUserId)
        .maybeSingle();

      if (error) {
        console.error('[XpHistoryModal] Error syncing XP total:', error);
        return;
      }

      const newTotal = data?.xp_total ?? 0;

      // If viewing own profile, update context
      if (targetUserId === user?.id) {
        await refreshProfile(user.id);
        // Dispatch event for compatibility
        window.dispatchEvent(new CustomEvent('xp-updated', {
          detail: { xp_total: newTotal },
        }));
      }

      // Call optional callback
      if (onAfterSyncXpTotal) {
        onAfterSyncXpTotal(newTotal);
      }
    } catch (error) {
      console.error('[XpHistoryModal] Error syncing XP total:', error);
    }
  };

  const loadHistory = async () => {
    if (!targetUserId) return;

    setLoading(true);
    try {
      // Load xp_history (reading sessions)
      const { data: historyData, error: historyError } = await supabase
        .from('xp_history')
        .select('id, amount, source, description, created_at')
        .eq('user_id', targetUserId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (historyError) {
        console.error('[XpHistoryModal] Error loading XP history:', historyError);
      }

      // Load xp_events (challenges)
      const { data: eventsData, error: eventsError } = await supabase
        .from('xp_events')
        .select('id, created_at, xp_amount, verdict, book_title, message, source')
        .eq('user_id', targetUserId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (eventsError) {
        console.error('[XpHistoryModal] Error loading XP events:', eventsError);
      }

      // Normalize xp_history items
      const historyItems: XpItem[] = (historyData || []).map((item: XpHistoryItem) => ({
        id: item.id,
        created_at: item.created_at,
        amount: item.amount,
        title: item.source === 'reading' ? 'Session de lecture' : (item.description || item.source),
        subtitle: item.description && item.source !== 'reading' ? item.description : null,
        kind: item.source,
      }));

      // Normalize xp_events items
      const eventItems: XpItem[] = (eventsData || []).map((event: XpEvent) => ({
        id: event.id,
        created_at: event.created_at,
        amount: event.xp_amount,
        title: event.message,
        subtitle: event.book_title ? `Défi compréhension · ${event.book_title}` : 'Défi compréhension',
        kind: 'challenge',
      }));

      // Merge and sort by created_at desc
      const allItems = [...historyItems, ...eventItems].sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ).slice(0, 50);

      setItems(allItems);
    } catch (error) {
      console.error('[XpHistoryModal] Error loading XP history:', error);
    } finally {
      setLoading(false);
    }
  };

  const personalizeMessage = (msg: string, name: string): string => {
    if (!msg) return msg;
    const n = name || 'Cet utilisateur';
    return msg
      .replace(/^Tu as /i, `${n} a `)
      .replace(/^Tu /i, `${n} `);
  };

  const formatTimeAgo = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'À l\'instant';
    if (diffMins < 60) return `Il y a ${diffMins} min`;
    if (diffHours < 24) return `Il y a ${diffHours}h`;
    if (diffDays < 7) return `Il y a ${diffDays}j`;
    
    // Format date (dd/mm)
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${day}/${month}`;
  };

  const getVerdictIcon = (verdict: string) => {
    switch (verdict) {
      case 'correct':
        return <span className="text-lg">✅</span>;
      case 'partial':
        return <span className="text-lg">🟡</span>;
      case 'incorrect':
        return <span className="text-lg">❌</span>;
      default:
        return null;
    }
  };

  const getVerdictLabel = (verdict: string) => {
    switch (verdict) {
      case 'correct':
        return 'Correct';
      case 'partial':
        return 'Presque';
      case 'incorrect':
        return 'Faux';
      default:
        return '';
    }
  };

  const getVerdictColor = (verdict: string) => {
    switch (verdict) {
      case 'correct':
        return 'text-green-600';
      case 'partial':
        return 'text-yellow-600';
      case 'incorrect':
        return 'text-gray-500';
      default:
        return 'text-gray-500';
    }
  };

  console.log('[XpHistoryModal] render open=', open);

  if (!open) return null;

  const modal = (
    <div
      className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4"
      data-modal-overlay
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          console.log('[XpHistoryModal] Closing via backdrop click');
          onClose();
        }
      }}
    >
      <div
        data-modal-content
        className="bg-white rounded-2xl max-w-xl w-full flex flex-col overflow-hidden shadow-xl"
        style={{
          height: 'min(70dvh, 560px)',
          maxHeight: 'calc(100dvh - 24px - env(safe-area-inset-top) - env(safe-area-inset-bottom))',
        }}
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 rounded-t-2xl flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Trophy className="w-6 h-6 text-primary" />
              <h2 className="text-xl font-bold text-text-main-light">Historique XP</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0" style={{ WebkitOverflowScrolling: 'touch' }}>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-text-sub-light">Chargement...</div>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Trophy className="w-12 h-12 text-stone-300 mb-4" />
              <p className="text-text-sub-light text-center">
                Aucun événement XP pour le moment
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start gap-3 p-4 bg-stone-50 rounded-xl border border-stone-200"
                >
                  {/* Icon */}
                  <div className="flex-shrink-0 mt-0.5">
                    {item.kind === 'challenge' ? (
                      <span className="text-lg">📚</span>
                    ) : item.kind === 'reading' ? (
                      <span className="text-lg">📖</span>
                    ) : (
                      <span className="text-lg">⭐</span>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-stone-900">
                          {displayName && targetUserId !== user?.id
                            ? personalizeMessage(item.title, displayName)
                            : item.title}
                        </p>
                        {item.subtitle && (
                          <p className="text-xs text-stone-500 mt-1">
                            {item.subtitle}
                          </p>
                        )}
                      </div>
                      {/* XP badge */}
                      <div className="flex-shrink-0">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${
                            item.amount === 0
                              ? 'bg-gray-100 text-gray-600 border border-gray-200'
                              : 'bg-stone-900 text-primary border border-primary/30'
                          }`}
                        >
                          {item.amount > 0 ? '+' : ''}
                          {formatXp(item.amount)} XP
                        </span>
                      </div>
                    </div>
                    {/* Date */}
                    <p className="text-xs text-stone-400 mt-2">
                      {formatTimeAgo(item.created_at)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
