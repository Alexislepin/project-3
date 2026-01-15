import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Pause, Play } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface ActiveSessionBannerProps {
  onResume: () => void;
  hidden?: boolean;
}

type ActiveActivity = {
  id: string;
  started_at: string;
  last_pause_at: string | null;
  paused_total_seconds: number | null;
  book: { title?: string | null } | null;
  pages_read?: number | null;
};

function computeDisplaySeconds(activity: ActiveActivity | null, now: number): number {
  if (!activity?.started_at) return 0;
  const started = new Date(activity.started_at).getTime();
  const pausedTotal = activity.paused_total_seconds || 0;
  const pauseLive = activity.last_pause_at ? Math.floor((now - new Date(activity.last_pause_at).getTime()) / 1000) : 0;
  return Math.max(0, Math.floor((now - started) / 1000) - pausedTotal - pauseLive);
}

export function ActiveSessionBanner({ onResume, hidden }: ActiveSessionBannerProps) {
  const { user } = useAuth();
  const [activity, setActivity] = useState<ActiveActivity | null>(null);
  const [now, setNow] = useState(Date.now());
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Refresh timer locally
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Load active reading activity
  const loadActive = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('activities')
      .select('id, started_at, last_pause_at, paused_total_seconds, pages_read, book:books(title)')
      .eq('user_id', user.id)
      .eq('type', 'reading')
      .is('ended_at', null)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('[ActiveSessionBanner] error loading activity', error);
      setActivity(null);
    } else {
      setActivity(data as any);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadActive();
    // Poll every 5s to catch fresh sessions created ailleurs
    const t = setInterval(loadActive, 5000);
    return () => clearInterval(t);
  }, [user?.id]);

  const displaySeconds = useMemo(() => computeDisplaySeconds(activity, now), [activity, now]);

  const handlePauseToggle = async () => {
    if (!user || !activity?.id) return;
    setActionLoading(true);
    const nowIso = new Date().toISOString();
    if (!activity.last_pause_at) {
      // Pause
      const { error } = await supabase
        .from('activities')
        .update({ last_pause_at: nowIso })
        .eq('id', activity.id)
        .eq('user_id', user.id);
      if (!error) {
        setActivity((prev) => prev ? { ...prev, last_pause_at: nowIso } : prev);
      } else {
        console.error('[ActiveSessionBanner] pause error', error);
      }
    } else {
      // Resume: accumulate paused time
      const pauseDelta = Math.floor((Date.now() - new Date(activity.last_pause_at).getTime()) / 1000);
      const newPaused = (activity.paused_total_seconds || 0) + Math.max(0, pauseDelta);
      const { error } = await supabase
        .from('activities')
        .update({ last_pause_at: null, paused_total_seconds: newPaused })
        .eq('id', activity.id)
        .eq('user_id', user.id);
      if (!error) {
        setActivity((prev) => prev ? { ...prev, last_pause_at: null, paused_total_seconds: newPaused } : prev);
      } else {
        console.error('[ActiveSessionBanner] resume error', error);
      }
    }
    setActionLoading(false);
  };

  // Hide banner if no active activity
  if (hidden || !activity) return null;

  const minutes = Math.floor(displaySeconds / 60);
  const seconds = displaySeconds % 60;
  const timeLabel = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const title = activity.book?.title || 'Session de lecture';
  const pageLabel = null; // current_page column does not exist anymore

  return (
    <div
      className="fixed left-0 right-0 z-[1250] px-4 pb-4 pointer-events-none"
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 96px)' }}
    >
      <div className="max-w-2xl mx-auto pointer-events-auto">
        <div className="bg-white/95 backdrop-blur rounded-2xl shadow-xl border border-gray-200 p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-text-main-light truncate">{title}</p>
            <p className="text-xs text-text-sub-light">
              {timeLabel}
              {pageLabel ? ` · ${pageLabel}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePauseToggle}
              disabled={actionLoading}
              aria-label={activity.last_pause_at ? 'Reprendre la session' : 'Mettre en pause'}
              className="w-10 h-10 rounded-full bg-gray-100 text-text-main-light hover:bg-gray-200 transition-colors flex items-center justify-center disabled:opacity-50"
            >
              {activity.last_pause_at ? (
                <Play className="w-5 h-5 text-black" color="#000000" />
              ) : (
                <Pause className="w-5 h-5 text-black" color="#000000" />
              )}
            </button>
            <button
              onClick={onResume}
              className="px-3 py-2 rounded-xl bg-text-main-light text-white text-sm font-semibold hover:bg-text-main-light/90 transition-colors"
            >
              Reprendre
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

