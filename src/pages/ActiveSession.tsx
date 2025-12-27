import { useState, useEffect } from 'react';
import { Flame, Clock, Pause, Play, X, Plus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { SessionSummary } from './SessionSummary';
import { BookCover } from '../components/BookCover';
import { AppHeader } from '../components/AppHeader';
import { updateStreakAfterActivity } from '../utils/streak';
import { Toast } from '../components/Toast';
import { BookRecapModal } from '../components/BookRecapModal';


type NoteTag = 'citation' | 'idee' | 'question' | null;

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
  const [showRecapModal, setShowRecapModal] = useState(false);
  const [showAddNoteModal, setShowAddNoteModal] = useState(false);
  const [notePage, setNotePage] = useState<string>('');
  const [noteText, setNoteText] = useState('');
  const [noteTag, setNoteTag] = useState<NoteTag>(null);
  const [savingNote, setSavingNote] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);
  const [activityId, setActivityId] = useState<string | null>(null);
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

    // Calculate reading pace
    const calcReadingPace = (pagesRead: number, durationMinutes: number) => {
      const mins = Math.max(1, durationMinutes);
      const pages = Math.max(0, pagesRead);

      const pagesPerHour = pages > 0 ? pages / (mins / 60) : 0;
      const minPerPage = pages > 0 ? mins / pages : 0;

      return {
        pagesPerHour: pages > 0 ? Number(pagesPerHour.toFixed(1)) : null,
        minPerPage: pages > 0 ? Number(minPerPage.toFixed(1)) : null,
      };
    };

    // Optionnel
    const calcWPM = (pagesRead: number, durationMinutes: number, wordsPerPage = 250) => {
      const mins = Math.max(1, durationMinutes);
      const pages = Math.max(0, pagesRead);
      if (pages === 0) return null;
      return Math.round((pages * wordsPerPage) / mins);
    };

    const { pagesPerHour, minPerPage } = calcReadingPace(pagesRead, durationMinutes);
    const wpm = calcWPM(pagesRead, durationMinutes, 250); // ou une value user/profile

    // Insert activity as DRAFT (visibility='private') - will be updated in SessionSummary
    const activityData: any = {
      user_id: user.id,
      type: 'reading',
      title: selectedBook.book ? `Read ${selectedBook.book.title}` : 'Reading session',
      book_id: selectedBook.book_id,
      pages_read: pagesRead,
      duration_minutes: durationMinutes,
      reading_speed_pph: pagesPerHour,
      reading_pace_min_per_page: minPerPage,
      reading_speed_wpm: wpm,
      visibility: 'private', // DRAFT - will be updated in SessionSummary
    };

    const { data: activityResult, error: activityError } = await supabase
      .from('activities')
      .insert(activityData)
      .select('id')
      .single();

    if (activityError || !activityResult) {
      console.error('[handleFinish] Failed to insert activity:', activityError);
      setSaving(false);
      // Don't show summary if insert failed
      return;
    }

    setSaving(false);
    // Store activityId to pass to SessionSummary
    setActivityId(activityResult.id);
    setShowSummary(true);
  };

  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleRecapClick = () => {
    setShowRecapModal(true);
  };

  const handleAddNote = async () => {
    if (!user || !selectedBook || !noteText.trim()) return;

    const pageNum = parseInt(notePage) || (currentPage ? parseInt(currentPage) : (startPage !== null ? startPage : selectedBook.current_page || 0));

    // Prefix note with tag if selected
    let finalNote = noteText.trim();
    if (noteTag === 'citation') {
      finalNote = `[Citation] ${finalNote}`;
    } else if (noteTag === 'idee') {
      finalNote = `[Idée clé] ${finalNote}`;
    } else if (noteTag === 'question') {
      finalNote = `[Question] ${finalNote}`;
    }

    setSavingNote(true);
    try {
      const { error } = await supabase
        .from('book_notes')
        .insert({
          user_id: user.id,
          book_id: selectedBook.book_id,
          page: pageNum,
          note: finalNote,
          created_from: 'manual',
        });

      if (error) {
        console.error('[ActiveSession] Error saving note:', error);
        setToast({ message: `Erreur: ${error.message}`, type: 'error' });
        return;
      }

      // Reset form
      setNoteText('');
      setNotePage('');
      setNoteTag(null);
      setShowAddNoteModal(false);

      // Show success toast
      setToast({ message: 'Note ajoutée ✅', type: 'success' });
      
      // Note saved - recap modal will reload automatically when opened
    } catch (err) {
      console.error('[ActiveSession] Error saving note:', err);
      setToast({ message: `Erreur: ${err instanceof Error ? err.message : String(err)}`, type: 'error' });
    } finally {
      setSavingNote(false);
    }
  };


  const openAddNoteModal = () => {
    console.log("[ActiveSession] openAddNoteModal");
    // Set default page
    const defaultPage = currentPage ? parseInt(currentPage) : (startPage !== null ? startPage : selectedBook?.current_page || 0);
    setNotePage(defaultPage.toString());
    setNoteText('');
    setNoteTag(null);
    setShowAddNoteModal(true);
  };


  // Render modals and toast in a wrapper that's always visible
  const renderModalsAndToast = () => (
    <>
      {/* Modal de rappel v2 */}
      {showRecapModal && selectedBook?.book && (
        <BookRecapModal
          open={showRecapModal}
          onClose={() => setShowRecapModal(false)}
          book={{
            id: selectedBook.book_id,
            title: selectedBook.book.title,
            author: selectedBook.book.author,
            cover_url: selectedBook.book.cover_url,
            total_pages: selectedBook.book.total_pages,
          }}
          uptoPage={selectedBook.current_page || 0}
        />
      )}
      

      {/* Modal ajouter note */}
      {showAddNoteModal && selectedBook?.book && (
        <div
          className="fixed inset-0 bg-black/50 z-[200] flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowAddNoteModal(false);
            }
          }}
        >
          <div className="bg-white rounded-2xl max-w-md w-full shadow-xl">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-text-main-light">Ajouter une note</h2>
                <button
                  type="button"
                  onClick={() => setShowAddNoteModal(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-text-main-light mb-2">
                    Page
                  </label>
                  <input
                    type="number"
                    value={notePage}
                    onChange={(e) => setNotePage(e.target.value)}
                    min={0}
                    className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                    placeholder="0"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-main-light mb-2">
                    Type de note
                  </label>
                  <div className="flex gap-2">
                    {(['citation', 'idee', 'question'] as const).map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => setNoteTag(noteTag === tag ? null : tag)}
                        className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                          noteTag === tag
                            ? 'bg-primary text-black'
                            : 'bg-gray-100 text-text-sub-light hover:bg-gray-200'
                        }`}
                      >
                        {tag === 'citation' ? 'Citation' : tag === 'idee' ? 'Idée clé' : 'Question'}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-main-light mb-2">
                    Note (max 280 caractères)
                  </label>
                  <textarea
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    maxLength={280}
                    rows={3}
                    className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:border-primary focus:ring-1 focus:ring-primary outline-none resize-none"
                    placeholder="Votre note ou highlight..."
                  />
                  <p className="text-xs text-text-sub-light mt-1 text-right">
                    {noteText.length}/280
                  </p>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddNoteModal(false)}
                    className="flex-1 py-2.5 px-4 rounded-xl bg-gray-100 hover:bg-gray-200 transition-colors text-sm font-medium text-text-main-light"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={handleAddNote}
                    disabled={!noteText.trim() || savingNote}
                    className="flex-1 py-2.5 px-4 rounded-xl bg-primary hover:brightness-95 transition-colors text-sm font-bold text-black disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {savingNote ? 'Enregistrement...' : 'Enregistrer'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </>
  );

  if (showSummary && selectedBook && selectedBook.book && startPage !== null) {
    const endPage = parseInt(currentPage) || startPage;
    const pagesRead = Math.max(0, endPage - startPage);
    const durationMinutes = Math.max(1, Math.floor(seconds / 60)); // ✅ Fix: prevent division by 0
    
    const calcReadingPace = (pagesRead: number, durationMinutes: number) => {
      const mins = Math.max(1, durationMinutes);
      const pages = Math.max(0, pagesRead);

      const pagesPerHour = pages > 0 ? pages / (mins / 60) : 0;
      const minPerPage = pages > 0 ? mins / pages : 0;

      return {
        pagesPerHour: pages > 0 ? Number(pagesPerHour.toFixed(1)) : null,
        minPerPage: pages > 0 ? Number(minPerPage.toFixed(1)) : null,
      };
    };
    
    const { pagesPerHour, minPerPage } = calcReadingPace(pagesRead, durationMinutes);
    return (
      <>
        {activityId && (
          <SessionSummary
            bookTitle={selectedBook.book.title}
            bookAuthor={selectedBook.book.author}
            bookId={selectedBook.book_id}
            pagesRead={pagesRead}
            durationMinutes={durationMinutes}
            currentPage={endPage}
            pagesPerHour={pagesPerHour}
            minPerPage={minPerPage}
            activityId={activityId}
            onComplete={onFinish}
            onCancel={() => setShowSummary(false)}
          />
        )}
        {renderModalsAndToast()}
      </>
    );
  }

  if (showBookSelect) {
    const onPickBook = (ub: any) => {
      setSelectedBook(ub);
      setTimeout(() => {
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      }, 50);
    };

    return (
      <div className="fixed inset-0 bg-background-light z-50 flex flex-col h-[100dvh] overflow-hidden">
        {/* Sticky Header with safe-area top */}
        <AppHeader
          title="Démarrer une session de lecture"
          showClose
          onClose={onCancel}
        />

        {/* Scrollable content container */}
        <div 
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-6"
          style={{
            WebkitOverflowScrolling: 'touch',
            overscrollBehaviorY: 'contain',
            overscrollBehaviorX: 'none',
            paddingBottom: 'calc(16px + var(--sab))',
          }}
        >
          <div className="w-full max-w-md mx-auto flex flex-col justify-center min-h-full py-8">
            <h3 className="text-2xl font-bold text-center mb-6">Que lisez-vous ?</h3>

            {userBooks.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-text-sub-light mb-4">Aucun livre dans votre bibliothèque</p>
                <p className="text-sm text-text-sub-light">Ajoutez d'abord des livres à votre bibliothèque</p>
              </div>
            ) : (
              <div className="max-h-[50vh] overflow-y-auto pr-1 scrollbar-hide mb-4">
              <div className="space-y-3">
                {userBooks.map((ub) => {
                  if (!ub.book) {
                    console.warn('UserBook without book data:', ub);
                    return null;
                  }
                  return (
                    <button
                      key={ub.book_id}
                        onClick={() => onPickBook(ub)}
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
              </div>
            )}

            <div
              className="sticky bottom-0 left-0 right-0 bg-background-light/95 backdrop-blur border-t border-gray-200 pt-4 pb-2"
              style={{ paddingBottom: 'calc(16px + var(--sab))' }}
            >
              <button
                onClick={() => {
                  if (!selectedBook) return;
                  startSession();
                }}
                disabled={!selectedBook}
                className={[
                  "w-full py-4 rounded-xl font-bold transition-colors",
                  selectedBook
                    ? "bg-text-main-light text-white hover:bg-text-main-light/90"
                    : "bg-gray-200 text-gray-500 cursor-not-allowed",
                ].join(" ")}
              >
                {selectedBook ? "Démarrer la session" : "Sélectionner un livre"}
              </button>

              {!selectedBook && (
                <p className="text-center text-xs text-text-sub-light mt-2">
                  Sélectionne un livre pour afficher le rappel IA et ajouter une note
                </p>
            )}
            </div>

            {/* Bouton "Rappel IA" sous le livre sélectionné */}
            {selectedBook && selectedBook.book && (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={handleRecapClick}
                  className="w-full py-3 px-4 rounded-xl bg-card-light border border-gray-200 hover:bg-gray-50 transition-colors text-sm font-medium text-text-main-light flex items-center justify-center gap-2"
                >
                  IA {selectedBook.current_page === 0 ? '(début)' : `(jusqu'à p.${selectedBook.current_page})`}
                </button>
              </div>
            )}
          </div>
        </div>
        {renderModalsAndToast()}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-background-light z-50 flex flex-col max-w-md mx-auto h-[100dvh] overflow-hidden">
      {/* Sticky Header with safe-area top */}
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

      {/* Scrollable content container */}
      <div 
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-6 pb-6"
        style={{
          paddingBottom: 'calc(24px + var(--sab))',
          WebkitOverflowScrolling: 'touch',
          overscrollBehaviorY: 'contain',
          overscrollBehaviorX: 'none',
        }}
      >
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
            {/* Boutons "Voir le rappel" et "+ Note" dans le header de la session active */}
            {selectedBook?.book && (
              <div className="mt-3 space-y-2">
                <button
                  type="button"
                  onClick={handleRecapClick}
                  className="w-full py-2.5 px-4 rounded-xl bg-card-light border border-gray-200 hover:bg-gray-50 transition-colors text-sm font-medium text-text-main-light flex items-center justify-center gap-2"
                >
                  IA {selectedBook.current_page === 0 ? '(début)' : `(jusqu'à p.${selectedBook.current_page})`}
                </button>
                <button
                  type="button"
                  onClick={openAddNoteModal}
                  className="w-full py-2 px-4 rounded-xl bg-card-light border border-gray-200 hover:bg-gray-50 transition-colors text-sm font-medium text-text-main-light flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Ajouter une note
                </button>
              </div>
            )}
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
      {renderModalsAndToast()}
    </div>
  );
}
