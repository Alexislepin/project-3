import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, BookOpen, Dumbbell, Brain, Target } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { AppHeader } from '../components/AppHeader';

const activityIcons = {
  reading: BookOpen,
  workout: Dumbbell,
  learning: Brain,
  habit: Target,
};

const activityLabels = {
  reading: 'Lecture',
  workout: 'Entraînement',
  learning: 'Apprentissage',
  habit: 'Habitude',
};

export function ActivityDetailsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activity, setActivity] = useState<any>(null);
  const [owner, setOwner] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Extract ID from URL path or query string
  const extractId = () => {
    // Try path param first: /activity/:id
    const pathMatch = location.pathname.match(/^\/activity\/([^/]+)$/);
    if (pathMatch && pathMatch[1]) {
      return pathMatch[1];
    }
    // Fallback: query string ?id=...
    const searchParams = new URLSearchParams(location.search);
    const queryId = searchParams.get('id');
    if (queryId) {
      return queryId;
    }
    return null;
  };

  useEffect(() => {
    const activityId = extractId();
    if (!activityId) {
      console.error('[ActivityDetailsPage] No ID found in URL:', location.pathname, location.search);
      setError('ID d\'activité manquant');
      setLoading(false);
      return;
    }

    const loadActivity = async () => {
      try {
        // Fetch activity
        const { data: activityData, error: activityError } = await supabase
          .from('activities')
          .select('*')
          .eq('id', activityId)
          .single();

        if (activityError) {
          console.error('[ActivityDetailsPage] Error fetching activity:', activityError);
          setError('Activité introuvable');
          setLoading(false);
          return;
        }

        if (!activityData) {
          setError('Activité introuvable');
          setLoading(false);
          return;
        }

        setActivity(activityData);

        // Fetch owner profile
        if (activityData.user_id) {
          const { data: ownerData, error: ownerError } = await supabase
            .from('user_profiles')
            .select('id, display_name, username, avatar_url')
            .eq('id', activityData.user_id)
            .single();

          if (ownerError) {
            console.error('[ActivityDetailsPage] Error fetching owner:', ownerError);
          } else {
            setOwner(ownerData);
          }
        }

        setLoading(false);
      } catch (err) {
        console.error('[ActivityDetailsPage] Unexpected error:', err);
        setError('Erreur lors du chargement de l\'activité');
        setLoading(false);
      }
    };

    loadActivity();
  }, [location.pathname, location.search]);

  const ActivityIcon = activity ? activityIcons[activity.type as keyof typeof activityIcons] || BookOpen : BookOpen;
  const activityLabel = activity ? activityLabels[activity.type as keyof typeof activityLabels] || 'Activité' : 'Activité';
  const ownerName = owner?.display_name || owner?.username || 'Utilisateur';
  
  // Clean activity title: remove "Read " prefix if present
  const cleanTitle = activity?.title?.replace(/^Read\s+/i, '') || '';

  if (loading) {
    return (
      <div className="h-screen max-w-2xl mx-auto bg-background-light">
        <AppHeader title="Détails de l'activité" showBack={true} onBack={() => window.location.href = '/social'} />
        <div className="flex items-center justify-center h-full">
          <div className="text-stone-500">Chargement...</div>
        </div>
      </div>
    );
  }

  if (error || !activity) {
    return (
      <div className="h-screen max-w-2xl mx-auto bg-background-light">
        <AppHeader title="Détails de l'activité" showBack={true} onBack={() => window.location.href = '/social'} />
        <div className="flex items-center justify-center h-full px-4" style={{ paddingTop: '56px' }}>
          <div className="text-center w-full max-w-md">
            <p className="text-stone-600 mb-4">{error || 'Activité introuvable'}</p>
            <button
              onClick={() => window.location.href = '/social'}
              className="px-6 py-3 rounded-xl bg-stone-900 text-white font-medium hover:bg-stone-800 transition-colors w-full"
            >
              Retour
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen max-w-2xl mx-auto bg-background-light overflow-hidden">
      <AppHeader title="Détails de l'activité" showBack={true} onBack={() => window.location.href = '/social'} />
      
      <div className="h-full overflow-y-auto" style={{ paddingTop: '56px', paddingBottom: 'calc(80px + env(safe-area-inset-bottom))' }}>
        <div className="p-4 space-y-4">
          {/* Header */}
          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <ActivityIcon className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1">
                <h1 className="text-xl font-bold text-stone-900">{cleanTitle || activity.title}</h1>
                <p className="text-sm text-stone-500">{activityLabel}</p>
              </div>
            </div>

            {/* Owner */}
            {owner && (
              <div className="flex items-center gap-2 mb-4">
                <span className="text-sm text-stone-600">Par</span>
                <span className="text-sm font-semibold text-stone-900">{ownerName}</span>
              </div>
            )}

            {/* Stats */}
            <div className="flex items-center gap-4 text-sm text-stone-600">
              {activity.pages_read && activity.pages_read > 0 && (
                <div>
                  <span className="font-semibold">{activity.pages_read}</span> pages
                </div>
              )}
              {activity.duration_minutes && activity.duration_minutes > 0 && (
                <div>
                  <span className="font-semibold">{activity.duration_minutes}</span> min
                </div>
              )}
              <div>
                {new Date(activity.created_at).toLocaleDateString('fr-FR', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </div>
            </div>
          </div>

          {/* Notes */}
          {activity.notes && (
            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-stone-900 mb-2">Notes</h2>
              <p className="text-stone-700 whitespace-pre-wrap">{activity.notes}</p>
            </div>
          )}

          {/* Quotes */}
          {activity.quotes && Array.isArray(activity.quotes) && activity.quotes.length > 0 && (
            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-stone-900 mb-3">Citations</h2>
              <div className="space-y-3">
                {activity.quotes.map((quote: any, index: number) => (
                  <div key={index} className="border-l-4 border-primary pl-3 py-2 bg-gray-50 rounded-r-lg">
                    <p className="text-sm text-stone-700 italic">"{quote.text}"</p>
                    {quote.page && (
                      <p className="text-xs text-stone-500 mt-1">Page {quote.page}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Photos */}
          {activity.photos && Array.isArray(activity.photos) && activity.photos.length > 0 && (
            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-stone-900 mb-3">Photos</h2>
              <div className="grid grid-cols-2 gap-3">
                {activity.photos.map((photo: string, index: number) => {
                  const photoUrl = photo.startsWith('http')
                    ? photo
                    : supabase.storage.from('activity-photos').getPublicUrl(photo).data.publicUrl;
                  return (
                    <div key={index} className="aspect-video rounded-lg overflow-hidden bg-gray-100">
                      <img
                        src={photoUrl}
                        alt={`Photo ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

