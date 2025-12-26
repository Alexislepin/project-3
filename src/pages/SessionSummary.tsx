import { useState, useEffect } from 'react';
import { X, Camera, Quote, Globe, Users, Lock } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { BookCover } from '../components/BookCover';
import { AppHeader } from '../components/AppHeader';

interface SessionSummaryProps {
  bookTitle: string;
  bookAuthor: string;
  bookId: string;
  pagesRead: number;
  durationMinutes: number;
  currentPage: number;
  onComplete: () => void;
  onCancel: () => void;
}

type Visibility = 'public' | 'followers' | 'private';

interface Quote {
  text: string;
  page: number;
}

export function SessionSummary({
  bookTitle,
  bookAuthor,
  bookId,
  pagesRead,
  durationMinutes,
  currentPage,
  onComplete,
  onCancel,
}: SessionSummaryProps) {
  const [notes, setNotes] = useState('');
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [currentQuote, setCurrentQuote] = useState('');
  const [currentQuotePage, setCurrentQuotePage] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [saving, setSaving] = useState(false);
  const [bookCover, setBookCover] = useState<string | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    const fetchBookData = async () => {
      const { data } = await supabase
        .from('books')
        .select('cover_url')
        .eq('id', bookId)
        .maybeSingle();

      if (data) {
        setBookCover(data.cover_url);
      }
    };

    fetchBookData();
  }, [bookId]);

  const visibilityOptions = [
    { value: 'public' as const, icon: Globe, label: 'Public', description: 'Tout le monde peut voir' },
    { value: 'followers' as const, icon: Users, label: 'Abonnés', description: 'Seulement vos abonnés' },
    { value: 'private' as const, icon: Lock, label: 'Privé', description: 'Seulement vous' },
  ];

  const addQuote = () => {
    if (currentQuote.trim() && currentQuotePage) {
      setQuotes([...quotes, { text: currentQuote.trim(), page: parseInt(currentQuotePage) }]);
      setCurrentQuote('');
      setCurrentQuotePage('');
    }
  };

  const removeQuote = (index: number) => {
    setQuotes(quotes.filter((_, i) => i !== index));
  };

  const handleShare = async () => {
    if (!user) return;

    setSaving(true);

    const activityData = {
      user_id: user.id,
      type: 'reading',
      title: `Read ${bookTitle}`,
      book_id: bookId,
      pages_read: pagesRead,
      duration_minutes: durationMinutes,
      notes: notes,
      quotes: quotes,
      visibility: visibility,
      photos: [],
    };

    const { error } = await supabase.from('activities').insert(activityData);

    if (!error) {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('total_pages_read, total_hours_logged')
        .eq('id', user.id)
        .maybeSingle();

      if (profile) {
        await supabase
          .from('user_profiles')
          .update({
            total_pages_read: (profile.total_pages_read || 0) + pagesRead,
            total_hours_logged: (profile.total_hours_logged || 0) + Math.floor(durationMinutes / 60),
          })
          .eq('id', user.id);
      }

      onComplete();
    }

    setSaving(false);
  };

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  return (
    <div className="fixed inset-0 bg-background-light z-50 flex flex-col max-w-md mx-auto min-h-screen">
      <AppHeader
        title="Partager votre activité"
        showClose
        onClose={onCancel}
      />

      <div className="flex-1 overflow-y-auto px-6 py-6" style={{ paddingBottom: 'calc(16px + var(--sab))' }}>
        <div className="bg-card-light rounded-2xl p-6 mb-6 border border-gray-200">
          <div className="flex items-start gap-4 mb-4">
            <BookCover
              coverUrl={bookCover || undefined}
              title={bookTitle}
              author={bookAuthor}
              className="size-16 rounded-lg shrink-0"
            />
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-lg leading-tight mb-1">{bookTitle}</h3>
              <p className="text-text-sub-light text-sm">{bookAuthor}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="bg-background-light rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-text-main-light">{pagesRead}</p>
              <p className="text-xs text-text-sub-light font-medium mt-1">Pages</p>
            </div>
            <div className="bg-background-light rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-text-main-light">{formatDuration(durationMinutes)}</p>
              <p className="text-xs text-text-sub-light font-medium mt-1">Durée</p>
            </div>
            <div className="bg-background-light rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-text-main-light">{currentPage}</p>
              <p className="text-xs text-text-sub-light font-medium mt-1">Actuel</p>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-bold text-text-main-light mb-2">
              Notes (facultatif)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary resize-none"
              rows={3}
              placeholder="Comment s'est passée votre session de lecture ?"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-text-main-light mb-2 flex items-center gap-2">
              <Quote className="w-4 h-4" />
              Citations (facultatif)
            </label>

            {quotes.length > 0 && (
              <div className="space-y-2 mb-3">
                {quotes.map((quote, index) => (
                  <div
                    key={index}
                    className="bg-card-light border border-gray-200 rounded-xl p-3 relative"
                  >
                    <button
                      onClick={() => removeQuote(index)}
                      className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-full hover:bg-gray-200 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                    <p className="text-sm text-text-main-light pr-6 mb-1 italic">"{quote.text}"</p>
                    <p className="text-xs text-text-sub-light">Page {quote.page}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2">
              <textarea
                value={currentQuote}
                onChange={(e) => setCurrentQuote(e.target.value)}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary resize-none"
                rows={2}
                placeholder="Une citation que vous avez aimée..."
              />
              <div className="flex gap-2">
                <input
                  type="number"
                  value={currentQuotePage}
                  onChange={(e) => setCurrentQuotePage(e.target.value)}
                  className="flex-1 px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  placeholder="Numéro de page"
                  min="1"
                />
                <button
                  onClick={addQuote}
                  disabled={!currentQuote.trim() || !currentQuotePage}
                  className="px-6 py-2 bg-text-main-light text-white rounded-xl font-medium hover:bg-text-main-light/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Ajouter
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-text-main-light mb-2 flex items-center gap-2">
              <Camera className="w-4 h-4" />
              Photos (facultatif)
            </label>
            <button className="w-full h-32 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center hover:border-gray-400 hover:bg-gray-50 transition-colors text-text-sub-light">
              <Camera className="w-8 h-8 mb-2" />
              <span className="text-sm font-medium">Ajouter des photos</span>
              <span className="text-xs mt-1">Bientôt disponible</span>
            </button>
          </div>

          <div>
            <label className="block text-sm font-bold text-text-main-light mb-3">
              Qui peut voir ceci ?
            </label>
            <div className="space-y-2">
              {visibilityOptions.map((option) => {
                const Icon = option.icon;
                return (
                  <button
                    key={option.value}
                    onClick={() => setVisibility(option.value)}
                    className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all ${
                      visibility === option.value
                        ? 'bg-primary/10 border-primary'
                        : 'bg-card-light border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <Icon className={`w-5 h-5 ${visibility === option.value ? 'text-primary' : 'text-text-sub-light'}`} />
                    <div className="flex-1 text-left">
                      <p className="font-bold text-sm">{option.label}</p>
                      <p className="text-xs text-text-sub-light">{option.description}</p>
                    </div>
                    <div
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                        visibility === option.value
                          ? 'border-primary bg-primary'
                          : 'border-gray-300'
                      }`}
                    >
                      {visibility === option.value && (
                        <div className="w-2 h-2 bg-white rounded-full" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="p-6 pt-4 shrink-0 bg-background-light border-t border-gray-200" style={{ paddingBottom: 'calc(16px + var(--sab))' }}>
        <button
          onClick={handleShare}
          disabled={saving}
          className="w-full h-14 flex items-center justify-center rounded-full bg-primary hover:brightness-95 transition-all disabled:opacity-50"
        >
          <span className="text-black text-lg font-bold uppercase tracking-wide">
            {saving ? 'Partage...' : 'Partager l\'activité'}
          </span>
        </button>
      </div>
    </div>
  );
}
