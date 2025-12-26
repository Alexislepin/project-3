import { useState, useEffect } from 'react';
import { X, BookOpen, Dumbbell, Brain, Target } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { updateStreakAfterActivity } from '../utils/streak';

type ActivityType = 'reading' | 'workout' | 'learning' | 'habit';

interface LogActivityProps {
  onClose: () => void;
  onComplete: () => void;
}

export function LogActivity({ onClose, onComplete }: LogActivityProps) {
  const [activityType, setActivityType] = useState<ActivityType | null>(null);
  const [title, setTitle] = useState('');
  const [pages, setPages] = useState('');
  const [duration, setDuration] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedBook, setSelectedBook] = useState<string | null>(null);
  const [userBooks, setUserBooks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    if (activityType === 'reading') {
      loadUserBooks();
    }
  }, [activityType]);

  const loadUserBooks = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('user_books')
      .select(`
        id,
        status,
        current_page,
        book_id,
        created_at,
        updated_at,
        book:books (
          id,
          title,
          author,
          cover_url,
          total_pages,
          description,
          isbn,
          google_books_id,
          edition
        )
      `)
      .eq('user_id', user.id)
      .eq('status', 'reading');

    console.log('[user_books fetch LogActivity]', { statusFilter: 'reading', data, error });

    if (data) {
      console.log('[user_books fetch LogActivity] Data received:', data.length, 'books');
      setUserBooks(data);
    } else {
      setUserBooks([]);
    }
  };

  const activityTypes = [
    { id: 'reading' as const, icon: BookOpen, label: 'Lecture', color: 'bg-blue-50 border-blue-200' },
    { id: 'workout' as const, icon: Dumbbell, label: 'Exercice', color: 'bg-orange-50 border-orange-200' },
    { id: 'learning' as const, icon: Brain, label: 'Apprentissage', color: 'bg-green-50 border-green-200' },
    { id: 'habit' as const, icon: Target, label: 'Habitude', color: 'bg-teal-50 border-teal-200' },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !activityType) return;

    setLoading(true);

    const activityData: any = {
      user_id: user.id,
      type: activityType,
      title: title || `${activityType.charAt(0).toUpperCase() + activityType.slice(1)} session`,
      pages_read: parseInt(pages) || 0,
      duration_minutes: parseInt(duration) || 0,
      notes: notes,
      book_id: selectedBook,
    };

    const { error } = await supabase.from('activities').insert(activityData);

    if (!error) {
      if (activityType === 'reading' && selectedBook && pages) {
        const { data: userBook } = await supabase
          .from('user_books')
          .select('current_page')
          .eq('user_id', user.id)
          .eq('book_id', selectedBook)
          .single();

        if (userBook) {
          const newPage = (userBook.current_page || 0) + parseInt(pages);
          await supabase
            .from('user_books')
            .update({ current_page: newPage, updated_at: new Date().toISOString() })
            .eq('user_id', user.id)
            .eq('book_id', selectedBook);
        }
      }

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('total_pages_read, total_hours_logged')
        .eq('id', user.id)
        .single();

      if (profile) {
        await supabase
          .from('user_profiles')
          .update({
            total_pages_read: (profile.total_pages_read || 0) + (parseInt(pages) || 0),
            total_hours_logged: (profile.total_hours_logged || 0) + Math.floor((parseInt(duration) || 0) / 60),
          })
          .eq('id', user.id);
      }

      // Update streak after activity is created
      await updateStreakAfterActivity(user.id);

      onComplete();
    }

    setLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto flex flex-col">
        <div 
          className="sticky top-0 bg-white border-b border-stone-200 z-10"
          style={{ paddingTop: 'calc(12px + var(--sat))' }}
        >
          <div className="px-6 py-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold">Partager votre activité</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-stone-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto" style={{ paddingBottom: 'calc(16px + var(--sab))' }}>
        {!activityType ? (
          <div className="p-6">
            <p className="text-stone-600 mb-4">Qu'avez-vous fait ?</p>
            <div className="grid grid-cols-2 gap-3">
              {activityTypes.map((type) => {
                const Icon = type.icon;
                return (
                  <button
                    key={type.id}
                    onClick={() => setActivityType(type.id)}
                    className={`p-6 rounded-xl border-2 transition-all hover:scale-105 ${type.color}`}
                  >
                    <Icon className="w-8 h-8 mb-2 mx-auto" />
                    <div className="font-medium">{type.label}</div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6">
            <div className="mb-6">
              <button
                type="button"
                onClick={() => setActivityType(null)}
                className="text-sm text-stone-600 hover:text-stone-900"
              >
                ← Changer le type d'activité
              </button>
            </div>

            <div className="space-y-4">
              {activityType === 'reading' && userBooks.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-2">
                    Livre
                  </label>
                  <select
                    value={selectedBook || ''}
                    onChange={(e) => setSelectedBook(e.target.value)}
                    className="w-full px-4 py-3 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-lime-400"
                  >
                    <option value="">Sélectionnez un livre</option>
                    {userBooks.map((ub) => (
                      <option key={ub.book_id} value={ub.book_id}>
                        {ub.book?.title || 'Livre sans titre'}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">
                  Titre (facultatif)
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-4 py-3 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-lime-400"
                  placeholder={`My ${activityType} session`}
                />
              </div>

              {activityType === 'reading' && (
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-2">
                    Pages lues
                  </label>
                  <input
                    type="number"
                    value={pages}
                    onChange={(e) => setPages(e.target.value)}
                    className="w-full px-4 py-3 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-lime-400"
                    placeholder="0"
                    min="0"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">
                  Durée (minutes)
                </label>
                <input
                  type="number"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  className="w-full px-4 py-3 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-lime-400"
                  placeholder="0"
                  min="0"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">
                  Notes (facultatif)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-4 py-3 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-lime-400 resize-none"
                  rows={3}
                  placeholder="Comment s'est passée votre session ?"
                />
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-3 border-2 border-stone-300 text-stone-700 rounded-lg font-medium hover:bg-stone-50 transition-colors"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 px-4 py-3 bg-stone-900 text-white rounded-lg font-medium hover:bg-stone-800 transition-colors disabled:opacity-50"
              >
                {loading ? 'Enregistrement...' : 'Enregistrer l\'activité'}
              </button>
            </div>
          </form>
        )}
        </div>
      </div>
    </div>
  );
}
