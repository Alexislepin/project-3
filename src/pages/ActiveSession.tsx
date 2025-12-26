import { useState, useEffect } from 'react';
import { ChevronDown, Flame, Clock, Pause, Play } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { SessionSummary } from './SessionSummary';
import { BookCover } from '../components/BookCover';
import { AppHeader } from '../components/AppHeader';
import { updateStreakAfterActivity } from '../utils/streak';

interface ActiveSessionProps {
  onFinish: () => void;
  onCancel: () => void;
}

export function ActiveSession({ onFinish, onCancel }: ActiveSessionProps) {
  const [selectedBook, setSelectedBook] = useState<any>(null);
  const [userBooks, setUserBooks] = useState<any[]>([]);
  const [showBookSelect, setShowBookSelect] = useState(true);
  const [showSummary, setShowSummary] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [startPage, setStartPage] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState('');
  const [saving, setSaving] = useState(false);
  const [currentStreak, setCurrentStreak] = useState(0);
  const { user } = useAuth();

  useEffect(() => {
    loadUserBooks();
    loadUserStreak();
  }, []);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRunning) {
      interval = setInterval(() => {
        setSeconds((s) => s + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRunning]);

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

    console.log('[user_books fetch ActiveSession]', { statusFilter: 'reading', data, error });

    if (error) {
      console.error('=== USER_BOOKS ERROR (ActiveSession) ===');
      console.error('Full error:', error);
      console.error('Message:', error.message);
      console.error('Details:', error.details);
      console.error('Hint:', error.hint);
      console.error('Code:', error.code);
      console.error('Query:', `user_books?select=book:books(...)&user_id=eq.${user.id}&status=eq.reading`);
    }

    if (data) {
      console.log('[user_books fetch ActiveSession] Data received:', data.length, 'books');
      setUserBooks(data);
    } else {
      setUserBooks([]);
    }
  };

  const loadUserStreak = async () => {
    if (!user) return;

    const { data } = await supabase
      .from('user_profiles')
      .select('current_streak')
      .eq('id', user.id)
      .maybeSingle();

    if (data) {
      setCurrentStreak(data.current_streak || 0);
    }
  };

  const startSession = () => {
    if (selectedBook) {
      // Store starting page when session begins
      setStartPage(selectedBook.current_page || 0);
      setShowBookSelect(false);
      setIsRunning(true);
    }
  };

  const togglePause = () => {
    setIsRunning(!isRunning);
  };

  const handleFinish = async () => {
    if (!user || !selectedBook || startPage === null) return;

    setSaving(true);

    const endPage = parseInt(currentPage) || startPage;
    const pagesRead = Math.max(0, endPage - startPage);
    const durationMinutes = Math.max(1, Math.floor(seconds / 60));

    // Check if book is completed
    const totalPages = selectedBook.book?.total_pages;
    const isCompleted = totalPages && endPage >= totalPages;

    // Update user_books current_page and status if completed
    const updateData: any = {
      current_page: endPage,
      updated_at: new Date().toISOString(),
    };
    if (isCompleted) {
      updateData.status = 'completed';
      updateData.completed_at = new Date().toISOString();
    }

    await supabase
      .from('user_books')
      .update(updateData)
      .eq('user_id', user.id)
      .eq('book_id', selectedBook.book_id);

    // Insert activity in activities table
    const activityData = {
      user_id: user.id,
      type: 'reading',
      title: selectedBook.book ? `Read ${selectedBook.book.title}` : 'Reading session',
      book_id: selectedBook.book_id,
      pages_read: pagesRead,
      duration_minutes: durationMinutes,
    };

    const { error: activityError } = await supabase
      .from('activities')
      .insert(activityData);

    if (activityError) {
      console.error('[handleFinish] Failed to insert activity:', activityError);
      setSaving(false);
      // Don't show summary if insert failed
      return;
    }

    // Update streak after activity is created
    await updateStreakAfterActivity(user.id);

    setSaving(false);
    setShowSummary(true);
  };

  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (showSummary && selectedBook && selectedBook.book && startPage !== null) {
    const endPage = parseInt(currentPage) || startPage;
    const pagesRead = Math.max(0, endPage - startPage);
    return (
      <SessionSummary
        bookTitle={selectedBook.book.title}
        bookAuthor={selectedBook.book.author}
        bookId={selectedBook.book_id}
        pagesRead={pagesRead}
        durationMinutes={Math.floor(seconds / 60)}
        currentPage={endPage}
        onComplete={onFinish}
        onCancel={() => setShowSummary(false)}
      />
    );
  }

  if (showBookSelect) {
    return (
      <div className="fixed inset-0 bg-background-light z-50 flex flex-col min-h-screen">
        <AppHeader
          title="Démarrer une session de lecture"
          showClose
          onClose={onCancel}
        />

        <div className="flex-1 flex flex-col items-center justify-center px-6" style={{ paddingBottom: 'calc(16px + var(--sab))' }}>
          <div className="w-full max-w-md">
            <h3 className="text-2xl font-bold text-center mb-8">Que lisez-vous ?</h3>

            {userBooks.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-text-sub-light mb-4">Aucun livre dans votre bibliothèque</p>
                <p className="text-sm text-text-sub-light">Ajoutez d'abord des livres à votre bibliothèque</p>
              </div>
            ) : (
              <div className="space-y-3">
                {userBooks.map((ub) => {
                  if (!ub.book) {
                    console.warn('UserBook without book data:', ub);
                    return null;
                  }
                  return (
                    <button
                      key={ub.book_id}
                      onClick={() => setSelectedBook(ub)}
                      className={`w-full flex items-center gap-4 p-4 rounded-xl transition-all ${
                        selectedBook?.book_id === ub.book_id
                          ? 'bg-primary text-black shadow-md'
                          : 'bg-card-light hover:bg-gray-50 border border-gray-200'
                      }`}
                    >
                      <BookCover
                        coverUrl={ub.book.cover_url}
                        title={ub.book.title}
                        author={ub.book.author || 'Auteur inconnu'}
                        className="w-12 h-16 rounded-lg flex-shrink-0"
                      />
                      <div className="flex-1 text-left">
                        <h4 className="font-bold text-base">{ub.book.title}</h4>
                        <p className={`text-sm ${selectedBook?.book_id === ub.book_id ? 'text-black/70' : 'text-text-sub-light'}`}>
                          {ub.book.author}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {selectedBook && (
              <button
                onClick={startSession}
                className="w-full mt-8 bg-text-main-light text-white py-4 rounded-xl font-bold hover:bg-text-main-light/90 transition-colors"
              >
                Démarrer la session
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-background-light z-50 flex flex-col max-w-md mx-auto min-h-screen">
      <AppHeader
        showClose
        onClose={onCancel}
        rightActions={
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/20">
            <div className="size-2 rounded-full bg-primary animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-wider text-text-sub-light">
              {isRunning ? 'Actif' : 'En pause'}
            </span>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto px-6 pb-6" style={{ paddingBottom: 'calc(24px + var(--sab))' }}>
        <div className="flex flex-col items-center justify-center min-h-full py-6">
          <div className="w-full mb-10">
            <div className="flex items-center gap-4 bg-card-light p-3 pr-6 rounded-full shadow-sm border border-gray-200">
              {selectedBook?.book && (
                <>
                  <BookCover
                    coverUrl={selectedBook.book.cover_url}
                    title={selectedBook.book.title}
                    author={selectedBook.book.author || 'Auteur inconnu'}
                    className="size-12 rounded-full shrink-0"
                  />
                  <div className="flex flex-col justify-center flex-1 min-w-0">
                    <p className="text-base font-bold leading-none truncate mb-1">
                      {selectedBook.book.title}
                    </p>
                    <p className="text-text-sub-light text-xs font-medium truncate">
                      Page {selectedBook?.current_page || 0} {selectedBook.book.total_pages ? `of ${selectedBook.book.total_pages}` : ''}
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-col items-center justify-center mb-12 w-full">
            <div className="text-[5rem] leading-none font-bold tabular-nums tracking-tighter text-text-main-light">
              {formatTime(seconds)}
            </div>
            <p className="text-text-sub-light text-base font-medium mt-2">Session active</p>
          </div>

          <div className="grid grid-cols-2 gap-4 w-full mb-8">
            <div className="flex flex-col items-center justify-center p-4 rounded-xl bg-card-light">
              <Flame className="w-5 h-5 text-text-sub-light mb-1" />
              <p className="text-2xl font-bold">{currentStreak}</p>
              <p className="text-xs font-medium text-text-sub-light uppercase tracking-wide">Jours de série</p>
            </div>
            <div className="flex flex-col items-center justify-center p-4 rounded-xl bg-card-light">
              <Clock className="w-5 h-5 text-text-sub-light mb-1" />
              <p className="text-2xl font-bold">{Math.floor(seconds / 60)}m</p>
              <p className="text-xs font-medium text-text-sub-light uppercase tracking-wide">Durée</p>
            </div>
          </div>

          <div className="w-full">
            <label className="flex items-center justify-between gap-4 bg-card-light border-2 border-gray-200 rounded-full p-2 pl-6 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition-all">
              <span className="text-base font-bold whitespace-nowrap">Page actuelle</span>
              <div className="flex items-center gap-2 flex-1 justify-end">
                <input
                  type="number"
                  value={currentPage}
                  onChange={(e) => setCurrentPage(e.target.value)}
                  className="w-24 text-right bg-transparent border-none p-0 text-xl font-bold placeholder-text-sub-light focus:ring-0"
                  placeholder={startPage?.toString() || "0"}
                  min={startPage || 0}
                />
                {startPage !== null && parseInt(currentPage) >= startPage && (
                  <span className="text-text-sub-light text-xs pr-2">
                    (+{Math.max(0, (parseInt(currentPage) || startPage) - startPage)} pgs)
                  </span>
                )}
                {startPage !== null && parseInt(currentPage) < startPage && (
                  <span className="text-red-500 text-xs pr-2">
                    (min: {startPage})
                  </span>
                )}
              </div>
            </label>
          </div>
        </div>
      </div>

      <div className="p-6 pt-2 shrink-0 bg-background-light" style={{ paddingBottom: 'calc(16px + var(--sab))' }}>
        <div className="flex items-center gap-4">
          <button
            onClick={togglePause}
            className="size-16 shrink-0 flex items-center justify-center rounded-full bg-card-light text-text-main-light hover:bg-gray-100 transition-colors"
          >
            {isRunning ? <Pause className="w-8 h-8" /> : <Play className="w-8 h-8 ml-1" />}
          </button>

          <button
            onClick={handleFinish}
            disabled={saving}
            className="h-16 flex-1 flex items-center justify-center rounded-full bg-primary hover:brightness-95 transition-all group relative overflow-hidden disabled:opacity-50"
          >
            <span className="relative z-10 text-black text-lg font-bold uppercase tracking-wide flex items-center gap-2">
              {saving ? 'Enregistrement...' : 'Terminer la session'}
            </span>
          </button>
        </div>
        <div className="mt-6 flex justify-center">
          <div className="h-1 w-32 bg-gray-200 rounded-full" />
        </div>
      </div>
    </div>
  );
}
