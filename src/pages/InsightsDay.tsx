import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { AppHeader } from '../components/AppHeader';
import { ActivityCard } from '../components/ActivityCard';

type ActivityRow = {
  id: string;
  user_id: string;
  type: 'reading' | 'workout' | 'learning' | 'habit';
  title: string;
  description: string | null;
  pages_read: number | null;
  duration_minutes: number | null;
  book_id: string | null;
  quotes: any[] | null;
  photos: string[] | null;
  created_at: string;
  book?: {
    id: string;
    title: string;
    author: string | null;
    cover_url?: string | null;
    openlibrary_cover_id?: number | null;
    isbn?: string | null;
    total_pages?: number | null;
  } | null;
  user?: {
    id: string;
    display_name: string;
    username: string;
    avatar_url?: string | null;
  } | null;
};

function startOfLocalDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseDateKey(dateKey: string): Date | null {
  const match = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [_, y, m, d] = match;
  const parsed = new Date(Number(y), Number(m) - 1, Number(d));
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export function InsightsDayPage({ dateKey }: { dateKey: string }) {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const targetDate = useMemo(() => parseDateKey(dateKey), [dateKey]);

  const friendlyDate = useMemo(() => {
    if (!targetDate) return dateKey;
    return targetDate.toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }, [dateKey, targetDate]);

  useEffect(() => {
    const loadDayActivities = async () => {
      if (!user) {
        setError('Utilisateur non authentifié.');
        setLoading(false);
        return;
      }

      if (!targetDate) {
        setError('Date invalide.');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const start = startOfLocalDay(targetDate);
        const end = new Date(start);
        end.setDate(end.getDate() + 1);

        const { data, error: supabaseError } = await supabase
          .from('activities')
          .select(`
            id,
            user_id,
            type,
            title,
            description,
            pages_read,
            duration_minutes,
            book_id,
            quotes,
            photos,
            created_at,
            book:books(
              id,
              title,
              author,
              cover_url,
              openlibrary_cover_id,
              isbn,
              total_pages
            ),
            user:user_profiles(
              id,
              display_name,
              username,
              avatar_url
            )
          `)
          .eq('user_id', user.id)
          .gte('created_at', start.toISOString())
          .lt('created_at', end.toISOString())
          .order('created_at', { ascending: false });

        if (supabaseError) {
          console.error('[InsightsDay] Supabase error', supabaseError);
          setError("Impossible de charger les activités de ce jour.");
          return;
        }

        const profileUser = {
          id: user.id,
          display_name: profile?.display_name || 'Vous',
          username: profile?.username || 'moi',
          avatar_url: profile?.avatar_url || null,
        };

        const mapped = (data || []).map((row) => ({
          id: row.id,
          user_id: row.user_id,
          type: row.type,
          title: row.title,
          pages_read: row.pages_read,
          duration_minutes: row.duration_minutes,
          book_id: row.book_id || undefined,
          book: row.book || undefined,
          notes: row.description,
          quotes: row.quotes || [],
          photos: row.photos || [],
          created_at: row.created_at,
          reactions_count: 0,
          comments_count: 0,
          user_has_reacted: false,
          user: row.user || profileUser,
          current_page: null,
        }));

        setActivities(mapped);
      } catch (err) {
        console.error('[InsightsDay] Unexpected error', err);
        setError("Une erreur est survenue en chargeant les activités.");
      } finally {
        setLoading(false);
      }
    };

    loadDayActivities();
  }, [dateKey, profile?.avatar_url, profile?.display_name, profile?.username, targetDate, user]);

  return (
    <div className="min-h-screen bg-background-light">
      <div className="max-w-2xl mx-auto">
        <AppHeader
          showBack
          onBack={() => navigate(-1)}
          title={`Activités du ${friendlyDate}`}
        />

        <div className="px-4 py-6 space-y-4">
          {loading && (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-24 bg-gray-200 rounded-xl animate-pulse" />
              ))}
            </div>
          )}

          {!loading && error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl p-3">
              {error}
            </div>
          )}

          {!loading && !error && activities.length === 0 && (
            <div className="text-sm text-text-sub-light bg-white border border-border rounded-xl p-4">
              Aucune activité enregistrée pour cette date.
            </div>
          )}

          {!loading && !error && activities.length > 0 && (
            <div className="space-y-3">
              {activities.map((activity) => (
                <ActivityCard
                  key={activity.id}
                  activity={activity as any}
                  onReact={() => {}}
                  onComment={() => {}}
                  variant="compact"
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


