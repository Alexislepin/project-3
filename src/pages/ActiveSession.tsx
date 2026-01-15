import { useState, useEffect, useRef, useCallback } from 'react';
import { Flame, Clock, Pause, Play, X, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { SessionSummary } from './SessionSummary';
import { BookCover } from '../components/BookCover';
import { AppHeader } from '../components/AppHeader';
import { Toast } from '../components/Toast';
import { BookRecapModal } from '../components/BookRecapModal';
import { RecapUIState, DEFAULT_RECAP_UI } from '../lib/recapUI';
import { useScrollLock } from '../hooks/useScrollLock';


type NoteTag = 'citation' | 'idee' | 'question' | null;

interface ActiveSessionProps {
  onFinish: () => void;
  onCancel: () => void;
}

export function ActiveSession({ onFinish, onCancel }: ActiveSessionProps) {
  // Lock body scroll when ActiveSession is open (full-screen focus mode)
  useScrollLock(true);

  // Set data-modal-open flag to hide tabbar/FAB
  useEffect(() => {
    document.body.dataset.modalOpen = '1';
    return () => {
      document.body.dataset.modalOpen = '0';
    };
  }, []);

  const [selectedBook, setSelectedBook] = useState<any>(null);
  const [userBooks, setUserBooks] = useState<any[]>([]);
  const [showBookSelect, setShowBookSelect] = useState(true);
  const [showSummary, setShowSummary] = useState(false);
  const [tickNow, setTickNow] = useState(Date.now());
  const [isRunning, setIsRunning] = useState(false);
  const [startPage, setStartPage] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState('');
  const [saving, setSaving] = useState(false);
  const [currentStreak, setCurrentStreak] = useState(0);
  const [showAddNoteModal, setShowAddNoteModal] = useState(false);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [pausedTotalSeconds, setPausedTotalSeconds] = useState(0);
  const [lastPauseAt, setLastPauseAt] = useState<string | null>(null);
  
  // BookRecapModal states (same pattern as Library)
  const [recapOpen, setRecapOpen] = useState(false);
  const [recapBook, setRecapBook] = useState<{
    book: { id: string; title: string; author?: string; cover_url?: string | null; total_pages?: number | null; book_key?: string | null; isbn?: string | null; openlibrary_key?: string | null; google_books_id?: string | null };
    uptoPage: number;
  } | null>(null);
  const [recapUI, setRecapUI] = useState<RecapUIState>(DEFAULT_RECAP_UI);
  const [recapTabTouched, setRecapTabTouched] = useState(false);
  const recapReqIdRef = useRef(0);
  const [notePage, setNotePage] = useState<string>('');
  const [noteText, setNoteText] = useState('');
  const [noteTag, setNoteTag] = useState<NoteTag>(null);
  const [savingNote, setSavingNote] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);
  const [activityId, setActivityId] = useState<string | null>(null);
  const [finishedSeconds, setFinishedSeconds] = useState<number | null>(null);
  const { user } = useAuth();
  const parsedCurrentPage = Number(currentPage);
  const pageProvided = currentPage.trim() !== '' && Number.isFinite(parsedCurrentPage);
  const pageValid = pageProvided && (startPage === null ? true : parsedCurrentPage >= startPage);
  const pageError =
    !pageProvided ? 'Indique ta page actuelle pour terminer' :
    startPage !== null && parsedCurrentPage < startPage ? `Min: ${startPage}` :
    '';

  // Prefill the current page with the starting page so the finish button isn't blocked
  useEffect(() => {
    if (currentPage === '' && startPage !== null) {
      setCurrentPage(String(startPage));
    }
  }, [currentPage, startPage]);
  
  // Navigation helpers to exit and open library/scanner
  const navigateToLibrary = (opts?: { openScanner?: boolean; openManualAdd?: boolean }) => {
    onCancel(); // close ActiveSession overlay
    // push state to library route and notify router
    window.history.pushState('/library', '', '/library');
    window.dispatchEvent(new PopStateEvent('popstate'));
    // defer actions until view switches
    setTimeout(() => {
      if (opts?.openScanner) {
        window.dispatchEvent(new CustomEvent('lexu:open-scanner'));
      }
      if (opts?.openManualAdd) {
        window.dispatchEvent(new CustomEvent('open-manual-add'));
      }
    }, 80);
  };
  
  // Guard anti double-submit
  const isSavingRef = useRef(false);
  const activityIdRef = useRef<string | null>(null);

  // Persist active session locally (fallback for banner)
  const persistActiveSession = (opts: {
    activityId: string;
    startedAt: string;
    lastPauseAt: string | null;
    pausedTotalSeconds: number;
    bookTitle?: string | null;
    currentPage?: number | null;
  }) => {
    const payload = {
      id: opts.activityId,
      started_at: opts.startedAt,
      last_pause_at: opts.lastPauseAt,
      paused_total_seconds: opts.pausedTotalSeconds,
      book: { title: opts.bookTitle ?? null },
      current_page: opts.currentPage ?? null,
    };
    try {
      localStorage.setItem('lexu_active_activity', JSON.stringify(payload));
    } catch {
      // ignore
    }
  };

  const clearActiveSessionPersisted = () => {
    try {
      localStorage.removeItem('lexu_active_activity');
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadUserBooks();
    loadUserStreak();
    loadActiveSession();
    
    // Reset refs au montage (nouvelle session)
    isSavingRef.current = false;
    activityIdRef.current = null;
  }, []);
  
  // Wrapper pour onCancel avec reset des refs
  const handleCancel = () => {
    isSavingRef.current = false;
    activityIdRef.current = null;
    clearActiveSessionPersisted();
    onCancel();
  };

  // Supprime l'activité et ferme l'écran (utilisé par le bouton corbeille footer)
  const handleDeleteFromFooter = async () => {
    if (!user || !activityId) {
      handleCancel();
      return;
    }
    try {
      // Marquer ended_at pour arrêter bannières/timers, puis delete
      const now = new Date().toISOString();
      await supabase
        .from('activities')
        .update({ ended_at: now })
        .eq('id', activityId)
        .eq('user_id', user.id);

      await supabase
        .from('activities')
        .delete()
        .eq('id', activityId)
        .eq('user_id', user.id);
    } catch (error) {
      console.error('[ActiveSession] delete from footer failed', error);
    } finally {
      handleCancel();
    }
  };
  
  // Wrapper pour onFinish avec reset des refs
  const handleFinishWrapper = () => {
    isSavingRef.current = false;
    activityIdRef.current = null;
    clearActiveSessionPersisted();
    onFinish();
  };

  // Tick for rerender (not source of truth)
  useEffect(() => {
    if (!activityId || !startedAt) return;
    const t = setInterval(() => setTickNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [activityId, startedAt]);

  // Calculate displaySeconds (source of truth for display)
  const displaySeconds = (() => {
    if (!startedAt) return 0;
    const base = Math.floor((tickNow - new Date(startedAt).getTime()) / 1000);
    const pauseLive = lastPauseAt ? Math.floor((tickNow - new Date(lastPauseAt).getTime()) / 1000) : 0;
    return Math.max(0, base - pausedTotalSeconds - pauseLive);
  })();

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
        custom_title,
        custom_author,
        custom_total_pages,
        custom_cover_url,
        custom_description,
        book:books (
          id,
          title,
          author,
          cover_url,
          total_pages,
          description,
          isbn,
          google_books_id,
          edition,
          openlibrary_cover_id
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

  const loadActiveSession = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('activities')
      .select('id, book_id, started_at, paused_total_seconds, last_pause_at')
      .eq('user_id', user.id)
      .eq('type', 'reading')
      .eq('visibility', 'private')
      .is('ended_at', null)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('[loadActiveSession] Error:', error);
      return;
    }

    if (data) {
      setActivityId(data.id);
      setStartedAt(data.started_at);
      setPausedTotalSeconds(data.paused_total_seconds || 0);
      setLastPauseAt(data.last_pause_at);
      setIsRunning(data.last_pause_at === null);
      setShowBookSelect(false);

      // Load selectedBook from user_books
      const { data: userBookData } = await supabase
        .from('user_books')
        .select(`
          id,
          status,
          current_page,
          book_id,
          created_at,
          updated_at,
          custom_title,
          custom_author,
          custom_total_pages,
          custom_cover_url,
          custom_description,
          book:books (
            id,
            title,
            author,
            cover_url,
            total_pages,
            description,
            isbn,
            google_books_id,
            edition,
            openlibrary_cover_id
          )
        `)
        .eq('user_id', user.id)
        .eq('book_id', data.book_id)
        .eq('status', 'reading')
        .maybeSingle();

      if (userBookData) {
        setSelectedBook(userBookData);
        setStartPage(userBookData.current_page || 0);
      }

      persistActiveSession({
        activityId: data.id,
        startedAt: data.started_at,
        lastPauseAt: data.last_pause_at,
        pausedTotalSeconds: data.paused_total_seconds || 0,
        bookTitle: (userBookData as any)?.book?.title ?? null,
        currentPage: (userBookData as any)?.current_page ?? null,
      });
    }
  };

  const startSession = async () => {
    if (!user || !selectedBook) return;

    // Guard anti double-submit
    if (isSavingRef.current) return;
    isSavingRef.current = true;

    const activityId = activityIdRef.current ?? (crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);
    activityIdRef.current = activityId;

    const now = new Date().toISOString();
    const payload: any = {
      id: activityId,
      user_id: user.id,
      type: 'reading',
      visibility: 'private',
      book_id: selectedBook.book_id,
      title: selectedBook.book ? `Read ${selectedBook.book.title}` : 'Reading session',
      started_at: now,
      ended_at: null,
      paused_total_seconds: 0,
      last_pause_at: null,
    };

    try {
      const { data: activityResult, error: activityError } = await supabase
        .from('activities')
        .insert(payload)
        .select('id, started_at, paused_total_seconds, last_pause_at')
        .single();

      if (activityError) {
        if ((activityError as any).code === '23505') {
          // Déjà inséré, utiliser l'ID existant et continuer
          setActivityId(activityId);
          setStartedAt(now);
          setPausedTotalSeconds(0);
          setLastPauseAt(null);
          setStartPage(selectedBook.current_page || 0);
          setShowBookSelect(false);
          setIsRunning(true);
          return;
        }
        throw activityError;
      }

      if (!activityResult) {
        throw new Error('No activity result returned');
      }

      setActivityId(activityResult.id);
      setStartedAt(activityResult.started_at);
      setPausedTotalSeconds(activityResult.paused_total_seconds || 0);
      setLastPauseAt(activityResult.last_pause_at);
      setStartPage(selectedBook.current_page || 0);
      setShowBookSelect(false);
      setIsRunning(true);
      persistActiveSession({
        activityId: activityResult.id,
        startedAt: activityResult.started_at,
        lastPauseAt: activityResult.last_pause_at,
        pausedTotalSeconds: activityResult.paused_total_seconds || 0,
        bookTitle: selectedBook.book?.title ?? null,
        currentPage: selectedBook.current_page ?? null,
      });
    } finally {
      isSavingRef.current = false;
      activityIdRef.current = null;
    }
  };

  const togglePause = async () => {
    if (!user || !activityId) return;

    const now = new Date().toISOString();

    if (isRunning) {
      // Pause
      const { error } = await supabase
        .from('activities')
        .update({ last_pause_at: now })
        .eq('id', activityId)
        .eq('user_id', user.id);

      if (error) {
        console.error('[togglePause] Failed to pause:', error);
        return;
      }

      setLastPauseAt(now);
      setIsRunning(false);
    } else {
      // Resume
      if (!lastPauseAt) return;

      const pauseSeconds = Math.floor((Date.now() - new Date(lastPauseAt).getTime()) / 1000);
      const newPausedTotal = pausedTotalSeconds + pauseSeconds;

      const { error } = await supabase
        .from('activities')
        .update({
          paused_total_seconds: newPausedTotal,
          last_pause_at: null,
        })
        .eq('id', activityId)
        .eq('user_id', user.id);

      if (error) {
        console.error('[togglePause] Failed to resume:', error);
        return;
      }

      setPausedTotalSeconds(newPausedTotal);
      setLastPauseAt(null);
      setIsRunning(true);
    }
  };

  const handleFinish = async () => {
    if (!user || !selectedBook || startPage === null || !activityId) return;

    const parsedPage = Number(currentPage);
    const pageProvided = currentPage.trim() !== '' && Number.isFinite(parsedPage);
    const pageValid = pageProvided && parsedPage >= startPage;
    if (!pageValid) {
      setToast({ message: 'Indique ta page actuelle avant de terminer', type: 'error' });
      return;
    }

    setSaving(true);

    const endPage = Math.max(startPage, Math.floor(parsedPage));
    const pagesRead = Math.max(0, endPage - startPage);
    const elapsedSeconds = Math.max(1, Math.round(displaySeconds)); // fige la durée exacte au moment du stop
    const durationMinutesFloat = Math.max(elapsedSeconds / 60, 1 / 60);
    const durationMinutes = Math.max(1, Math.round(durationMinutesFloat)); // DB column is integer
    setFinishedSeconds(elapsedSeconds);

    // Check if book is completed
    const bookTotalPages = selectedBook.book?.total_pages ?? selectedBook.custom_total_pages ?? null;
    const isCompleted = bookTotalPages && endPage >= bookTotalPages;

    // Update user_books current_page and status if completed
    const userBookUpdateData: any = {
      current_page: endPage,
      updated_at: new Date().toISOString(),
    };
    if (isCompleted) {
      userBookUpdateData.status = 'completed';
      userBookUpdateData.completed_at = new Date().toISOString();
    }

    await supabase
      .from('user_books')
      .update(userBookUpdateData)
      .eq('user_id', user.id)
      .eq('book_id', selectedBook.book_id);

    // Calculate reading pace
    const calcReadingPace = (pagesRead: number, mins: number) => {
      const pages = Math.max(0, pagesRead);
      if (pages === 0) {
        return { pagesPerHour: null, minPerPage: null };
      }

      const pagesPerHourRaw = pages / (mins / 60);
      const minPerPageRaw = mins / pages;

      return {
        pagesPerHour: Math.round(Math.max(0, pagesPerHourRaw)),
        minPerPage: Math.round(Math.max(0, minPerPageRaw)),
      };
    };

    // Optionnel
    const calcWPM = (pagesRead: number, mins: number, wordsPerPage = 250) => {
      const pages = Math.max(0, pagesRead);
      if (pages === 0) return null;
      return Math.round((pages * wordsPerPage) / mins);
    };

    const { pagesPerHour, minPerPage } = calcReadingPace(pagesRead, durationMinutesFloat);
    const wpm = calcWPM(pagesRead, durationMinutesFloat, 250); // ou une value user/profile

    // Update the existing activity row
    const now = new Date().toISOString();
    const totalPages = selectedBook.book?.total_pages ?? selectedBook.custom_total_pages ?? null;

    const updateData: any = {
      ended_at: now,
      pages_read: pagesRead,
      duration_minutes: durationMinutes,
      reading_speed_pph: pagesPerHour,
      reading_pace_min_per_page: minPerPage,
      reading_speed_wpm: wpm,
      title: selectedBook.book ? `Read ${selectedBook.book.title}` : 'Reading session',
    };

    // If still paused, add the current pause time
    if (lastPauseAt) {
      const pauseSeconds = Math.floor((Date.now() - new Date(lastPauseAt).getTime()) / 1000);
      updateData.paused_total_seconds = pausedTotalSeconds + pauseSeconds;
      updateData.last_pause_at = null;
    }

    const { error: activityError } = await supabase
      .from('activities')
      .update(updateData)
      .eq('id', activityId)
      .eq('user_id', user.id);

    if (activityError) {
      console.error('[handleFinish] Failed to update activity:', activityError);
      setSaving(false);
      // Don't show summary if update failed
      return;
    }

    // Award XP for reading session (if duration >= 5 minutes)
    if (durationMinutes >= 5) {
      try {
        const { calculateReadingXp } = await import('../lib/calculateReadingXp');
        const xp = calculateReadingXp(durationMinutes, pagesRead);
        
        console.log('[award_xp] awarded', { 
          xp, 
          durationMinutes, 
          pagesRead 
        });
        
        if (xp > 0) {
          const { data: xpResult, error: xpError } = await supabase.rpc('award_xp_v2', {
            p_user_id: user.id,
            p_amount: xp,
            p_source: 'reading',
          });

          if (xpError) {
            console.error('[award_xp] failed', xpError);
          } else if (xpResult !== null && xpResult !== undefined) {
            console.log('[award_xp] success', { xp, xpResult, durationMinutes, pagesRead });
            // Dispatch xp-updated event to refresh UI
            window.dispatchEvent(new CustomEvent('xp-updated', {
              detail: { xp_total: xpResult }
            }));
          } else {
            console.warn('[award_xp] no result returned', { xp, durationMinutes, pagesRead });
          }
        }
      } catch (error) {
        console.error('[handleFinish] Error awarding XP:', error);
      }
    }

    setSaving(false);
    setShowSummary(true);
    clearActiveSessionPersisted();
  };

  // Helper to get display fields (same as Library)
  const getDisplayFields = (userBook: any) => {
    const book = userBook.book;
    return {
      displayTitle: userBook.custom_title ?? book?.title ?? 'Titre inconnu',
      displayAuthor: userBook.custom_author ?? book?.author ?? 'Auteur inconnu',
      displayPages: userBook.custom_total_pages ?? book?.total_pages ?? null,
      displayCover: userBook.custom_cover_url ?? book?.cover_url ?? null,
    };
  };

  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleRecapClick = () => {
    if (!selectedBook?.book) return;
    
    const { displayTitle, displayAuthor, displayPages, displayCover } = getDisplayFields(selectedBook);
    const book = selectedBook.book;
    
    setRecapBook({
      book: {
        id: selectedBook.book_id,
        title: displayTitle,
        author: displayAuthor,
        cover_url: displayCover,
        total_pages: displayPages,
        isbn: book.isbn || null,
        book_key: (book as any).book_key || (book as any).openlibrary_work_key || null,
        openlibrary_key: (book as any).openlibrary_work_key || null,
        google_books_id: book.google_books_id || null,
      },
      uptoPage: selectedBook.current_page || 0,
    });
    setRecapOpen(true);
  };
  
  // Load recap function (same pattern as Library)
  const loadRecap = useCallback(async (force = false) => {
    if (!user || !recapBook) return;
    
    const isValidBook = Boolean(recapBook.book?.id && recapBook.book.id !== 'noop' && recapBook.book.title);
    if (!isValidBook) {
      console.log('[ActiveSession] loadRecap blocked: invalid book');
      return;
    }
    
    // Block if challenge is submitting; allow force reload even after submission
    if (recapUI.challengeSubmitting) {
      console.log('[ActiveSession] loadRecap blocked', { 
        challengeSubmitting: recapUI.challengeSubmitting,
        hasSubmittedChallenge: recapUI.hasSubmittedChallenge
      });
      return;
    }
    if (!force && recapUI.hasSubmittedChallenge) {
      console.log('[ActiveSession] loadRecap blocked (challenge already submitted)');
      return;
    }
    
    // ✅ Anti-race "stale response" propre avec compteur
    const reqId = ++recapReqIdRef.current;
    
    console.log('[ActiveSession] loadRecap called', { force, bookId: recapBook.book.id, uptoPage: recapBook.uptoPage });
    
    setRecapUI(s => ({ 
      ...s, 
      recapLoading: true, 
      recapError: null,
      // Reset challenge state when forcing to allow a new attempt
      hasSubmittedChallenge: force ? false : s.hasSubmittedChallenge,
      challengeResult: force ? null : s.challengeResult,
      userAnswerDraft: force ? '' : s.userAnswerDraft,
      submittedAnswer: force ? '' : s.submittedAnswer,
      frozenQuestion: force ? null : s.frozenQuestion,
      challengeSubmitting: false,
    }));
    
    try {
      const payload: any = {
        bookId: recapBook.book.id,
        uptoPage: recapBook.uptoPage,
        current_page: recapBook.uptoPage,
        language: 'fr',
        force,
      };
      
      if (recapBook.book.book_key) {
        payload.book_key = recapBook.book.book_key;
      } else if (recapBook.book.openlibrary_key) {
        payload.book_key = recapBook.book.openlibrary_key;
      }
      
      if (recapBook.book.isbn) {
        payload.isbn = recapBook.book.isbn;
      }
      
      const { data, error } = await supabase.functions.invoke('book_recap_v2', {
        body: payload,
      });
      
      // ✅ Log la réponse brute pour debug
      console.log('[Recap] invoke result', { reqId, latest: recapReqIdRef.current, error, data });
      
      // ✅ Ignorer les réponses obsolètes
      if (reqId !== recapReqIdRef.current) {
        console.log('[Recap] ignoring stale response', { reqId, latest: recapReqIdRef.current });
        return;
      }
      
      // ✅ Fallback front-end si jamais on reçoit encore status:"no_data"
      if (data?.status === 'no_data') {
        console.warn('[Recap] no_data received -> converting to fallback recap', data);
        
        const fallback = {
          ultra_20s: "Rappel prêt, même sans notes.",
          summary:
            "Je n'ai pas encore de notes/sessions enregistrées. Voici un aperçu général. Ajoute une note ou termine une session pour enrichir le rappel.",
          key_takeaways: [
            "Aperçu général (sans spoiler)",
            "Thèmes majeurs",
            "Contexte",
            "Ce qu'il faut suivre en lisant",
            "Ajoute une note pour personnaliser",
          ],
          characters: [],
          detailed:
            "Conseil : ajoute une note rapide ou enregistre une session (même 1 minute) pour générer un rappel personnalisé.",
          challenge: {
            question: "Comment rendre ce rappel plus pertinent ?",
            answer: "Ajouter une note ou une session de lecture.",
            explanation: "Cela donne du contexte réel à l'IA.",
          },
          meta: data?.meta,
        };
        
        setRecapUI(s => ({ 
          ...s, 
          recapLoading: false,
          recapData: fallback,
          recapError: null
        }));
        return;
      }
      
      if (error) {
        const requestId = data?.requestId || data?.meta?.requestId || 'unknown';
        setRecapUI(s => ({ 
          ...s, 
          recapLoading: false,
          recapError: { message: error.message || 'Erreur serveur', requestId }
        }));
        return;
      }
      
      if (data && data.ok === false) {
        const requestId = data.requestId || data.meta?.requestId || 'unknown';
        setRecapUI(s => ({ 
          ...s, 
          recapLoading: false,
          recapError: { message: data.error || 'Impossible de charger le rappel', requestId }
        }));
        return;
      }
      
      if (data && data.ultra_20s) {
        const recapData = {
          summary: data.summary || '',
          ultra_20s: data.ultra_20s,
          takeaways: data.takeaways || '',
          question: data.question,
          answer: data.answer,
          explanation: data.explanation,
          key_takeaways: data.key_takeaways,
          key_moments: data.key_moments,
          challenge: data.challenge,
          chapters: data.chapters,
          detailed: data.detailed,
          characters: data.characters || [],
          uptoPage: data.uptoPage || data.meta?.uptoPage || recapBook.uptoPage,
          meta: data.meta,
        };
        
        setRecapUI(s => ({ 
          ...s,
          recapData,
          recapLoading: false,
          recapError: null,
          tab: 'personnages',
          userAnswerDraft: '',
        }));
      } else {
        setRecapUI(s => ({ 
          ...s, 
          recapLoading: false,
          recapError: { message: 'Réponse invalide du serveur', requestId: data?.meta?.requestId || 'unknown' }
        }));
      }
    } catch (err: any) {
      if (reqId !== recapReqIdRef.current) return;
      console.error('[ActiveSession] loadRecap error:', err);
      setRecapUI(s => ({ 
        ...s, 
        recapLoading: false,
        recapError: { message: err.message || 'Erreur inattendue', requestId: 'unknown' }
      }));
    }
  }, [user, recapBook, recapUI.challengeSubmitting, recapUI.hasSubmittedChallenge]);

  // Stop déclenché depuis la bannière : ouvrir l'écran et terminer comme si on appuyait sur "Terminer la session"
  useEffect(() => {
    const handleStopFromBanner = () => {
      if (saving || showSummary) return;
      void handleFinish();
    };
    window.addEventListener('lexu:stop-session-from-banner', handleStopFromBanner);
    return () => window.removeEventListener('lexu:stop-session-from-banner', handleStopFromBanner);
  }, [handleFinish, saving, showSummary]);
  
  // Auto-load recap when modal opens
  useEffect(() => {
    if (recapOpen && recapBook && !recapTabTouched) {
      loadRecap(false);
    }
  }, [recapOpen, recapBook, recapTabTouched, loadRecap]);
  
  // ✅ Masquer tabbar/FAB quand ActiveSession est ouvert (full-screen focus)
  useEffect(() => {
    document.body.dataset.activeSession = '1';
    return () => {
      document.body.dataset.activeSession = '0';
    };
  }, []);

  // Set modalOpen flag to prevent navigation on xp-updated
  useEffect(() => {
    if (recapOpen) {
      document.body.dataset.modalOpen = '1';
    } else {
      document.body.dataset.modalOpen = '0';
    }
    return () => {
      document.body.dataset.modalOpen = '0';
    };
  }, [recapOpen]);

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
      {/* Modal de rappel v2 (controlled mode, same as Library) */}
      {recapOpen && recapBook && (
        <BookRecapModal
          open={recapOpen}
          onClose={() => {
            setRecapOpen(false);
            // Reset UI state only if challenge hasn't been submitted
            if (!recapUI.hasSubmittedChallenge) {
              setRecapUI(DEFAULT_RECAP_UI);
              setRecapTabTouched(false);
            }
            setRecapBook(null);
          }}
          book={recapBook.book}
          uptoPage={recapBook.uptoPage}
          ui={recapUI}
          setUI={setRecapUI}
          onTabChange={(tab) => {
            setRecapTabTouched(true);
            setRecapUI(s => ({ ...s, tab }));
          }}
          loadRecap={loadRecap}
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
    const endPage = Number.isFinite(Number(currentPage))
      ? Math.max(startPage, Math.floor(Number(currentPage)))
      : startPage;
    const pagesRead = Math.max(0, endPage - startPage);
    const durationSeconds = finishedSeconds ?? Math.max(1, displaySeconds);
    const durationMinutes = Math.max(1, Math.round(durationSeconds / 60)); // arrondi pour l'affichage / stockage
    
    const { displayTitle, displayAuthor, displayCover } = getDisplayFields(selectedBook);
    
    return (
      <>
        {activityId && (
          <SessionSummary
            bookTitle={displayTitle}
            bookAuthor={displayAuthor}
            bookId={selectedBook.book_id}
            coverUrl={displayCover}
            pagesRead={pagesRead}
            durationMinutes={durationMinutes}
            durationSeconds={durationSeconds}
            currentPage={endPage}
            originalPage={startPage}
            originalStatus={selectedBook.status}
            activityId={activityId}
            onComplete={handleFinishWrapper}
            onCancel={() => setShowSummary(false)}
            onDeleted={handleFinishWrapper}
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

    const footerVisible = userBooks.length > 0;
    const BOOK_SELECT_FOOTER_H = 130; // footer réduit pour remonter le call-to-action

    return (
      <div 
        className="fixed inset-0 bg-background-light z-[200] flex flex-col h-[100dvh] overflow-hidden"
      >
        {/* Header avec safe-area top et hit-area généreuse */}
        <div style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
          <AppHeader
            title="Démarrer une session de lecture"
            showClose
            onClose={handleCancel}
          />
        </div>

        {/* Conteneur central sans double scroll : une seule zone scrollable */}
        <div className="flex-1 min-h-0 flex justify-center px-4">
          <div 
            className="w-full max-w-xl flex flex-col min-h-0"
            style={{ paddingTop: '12px' }}
          >
            <h3 className="text-2xl font-bold text-center mb-4">Que lisez-vous ?</h3>

            <div
              className="flex-1 min-h-0 overflow-y-auto overscroll-contain"
              style={{
                WebkitOverflowScrolling: 'touch',
                overscrollBehavior: 'contain',
                paddingBottom: footerVisible
                  ? `calc(${BOOK_SELECT_FOOTER_H}px + env(safe-area-inset-bottom) + 20px)`
                  : `calc(env(safe-area-inset-bottom) + 20px)`,
                maxHeight: 'min(70vh, 520px)', // petite fenêtre centrée sur iPhone
              }}
            >
              {userBooks.length === 0 ? (
                <div className="text-center py-12 space-y-4">
                  <p className="text-text-sub-light">Aucun livre dans votre bibliothèque</p>
                  <p className="text-sm text-text-sub-light">Ajoutez d'abord des livres à votre bibliothèque</p>
                  <div className="flex flex-col gap-2 items-center">
                    <button
                      type="button"
                      onClick={() => navigateToLibrary({ openManualAdd: true })}
                      className="w-full max-w-xs py-3 px-4 rounded-xl bg-primary text-black font-semibold hover:brightness-95 transition-colors shadow-sm"
                    >
                      Ajouter un livre
                    </button>
                    <button
                      type="button"
                      onClick={() => navigateToLibrary({ openScanner: true })}
                      className="w-full max-w-xs py-3 px-4 rounded-xl border border-gray-200 text-text-main-light font-semibold transition-colors"
                    >
                      Scanner un livre
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 pb-2">
                  {userBooks.map((ub) => {
                    if (!ub.book) {
                      console.warn('UserBook without book data:', ub);
                      return null;
                    }
                    const { displayTitle, displayAuthor, displayCover } = getDisplayFields(ub);
                    const book = ub.book;
                    return (
                      <button
                        key={ub.book_id}
                        onClick={() => onPickBook(ub)}
                        className={`w-full flex items-center gap-4 p-4 rounded-xl transition-all ${
                          selectedBook?.book_id === ub.book_id
                            ? 'bg-primary text-black shadow-md'
                            : 'bg-card-light border border-gray-200'
                        }`}
                      >
                        <BookCover
                          custom_cover_url={ub.custom_cover_url || null}
                          coverUrl={displayCover}
                          title={displayTitle}
                          author={displayAuthor}
                          isbn={(book as any)?.isbn || null}
                          isbn13={(book as any)?.isbn13 || null}
                          isbn10={(book as any)?.isbn10 || null}
                          cover_i={(book as any)?.openlibrary_cover_id || null}
                          openlibrary_cover_id={(book as any)?.openlibrary_cover_id || null}
                          googleCoverUrl={(book as any)?.google_books_id ? `https://books.google.com/books/content?id=${(book as any).google_books_id}&printsec=frontcover&img=1&zoom=1&source=gbs_api` : null}
                          className="w-12 h-16 rounded-lg flex-shrink-0"
                          bookId={book?.id}
                        />
                        <div className="flex-1 text-left">
                          <h4 className="font-bold text-base">{displayTitle}</h4>
                          <p className={`text-sm ${selectedBook?.book_id === ub.book_id ? 'text-black/70' : 'text-text-sub-light'}`}>
                            {displayAuthor}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ✅ Footer FIXED (ne scroll plus avec la liste) */}
        {footerVisible && (
          <div
            className="fixed left-0 right-0 z-[60]"
            style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 32px)' }}
          >
            <div className="max-w-xl mx-auto px-6">
              <div className="bg-background-light/95 backdrop-blur border border-gray-200 rounded-2xl shadow-lg p-4 space-y-3">
                {/* ✅ IA toujours visible quand un livre est sélectionné */}
                {selectedBook?.book && (
                  <button
                    type="button"
                    onClick={handleRecapClick}
                    className="w-full py-3 px-4 rounded-xl bg-card-light border border-gray-200 transition-colors text-sm font-medium text-text-main-light flex items-center justify-center gap-2"
                  >
                    IA {selectedBook.current_page === 0 ? '(début)' : `(jusqu'à p.${selectedBook.current_page})`}
                  </button>
                )}

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
                  <p className="text-center text-xs text-text-sub-light">
                    Sélectionne un livre pour afficher le rappel IA et ajouter une note
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {renderModalsAndToast()}
      </div>
    );
  }

  // Footer height estimate for padding calculation
  const ACTIVE_SESSION_FOOTER_H = 120; // ~ buttons + padding

  return (
    <div 
      className="fixed inset-0 bg-background-light z-[200] flex flex-col h-[100dvh] overflow-hidden"
    >
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
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-6"
        style={{
          WebkitOverflowScrolling: 'touch',
          overscrollBehaviorY: 'contain',
          overscrollBehaviorX: 'none',
          // Pas de tabbar : on ne réserve que le footer + safe-area
          paddingBottom: `calc(${ACTIVE_SESSION_FOOTER_H}px + env(safe-area-inset-bottom, 0px) + 16px)`,
        }}
      >
        <div className="flex flex-col items-center justify-center min-h-full py-6">
          <div className="w-full mb-10">
            <div className="flex items-center gap-4 bg-card-light p-3 pr-6 rounded-full shadow-sm border border-gray-200">
              {selectedBook?.book && (() => {
                const { displayTitle, displayAuthor, displayPages, displayCover } = getDisplayFields(selectedBook);
                const book = selectedBook.book;
                return (
                  <>
                    <BookCover
                      custom_cover_url={selectedBook.custom_cover_url || null}
                      coverUrl={displayCover}
                      title={displayTitle}
                      author={displayAuthor}
                      isbn={(book as any)?.isbn || null}
                      isbn13={(book as any)?.isbn13 || null}
                      isbn10={(book as any)?.isbn10 || null}
                      cover_i={(book as any)?.openlibrary_cover_id || null}
                      openlibrary_cover_id={(book as any)?.openlibrary_cover_id || null}
                      googleCoverUrl={(book as any)?.google_books_id ? `https://books.google.com/books/content?id=${(book as any).google_books_id}&printsec=frontcover&img=1&zoom=1&source=gbs_api` : null}
                      className="size-12 rounded-full shrink-0"
                      bookId={book?.id}
                    />
                    <div className="flex flex-col justify-center flex-1 min-w-0">
                      <p className="text-base font-bold leading-none truncate mb-1">
                        {displayTitle}
                      </p>
                      <p className="text-text-sub-light text-xs font-medium truncate">
                        Page {selectedBook?.current_page || 0} {displayPages ? `of ${displayPages}` : ''}
                      </p>
                    </div>
                  </>
                );
              })()}
            </div>
            {/* Boutons "Voir le rappel" et "+ Note" dans le header de la session active */}
            {selectedBook?.book && (
              <div className="mt-3 space-y-2">
                <button
                  type="button"
                  onClick={handleRecapClick}
                  className="w-full py-2.5 px-4 rounded-xl bg-card-light border border-gray-200 transition-colors text-sm font-medium text-text-main-light flex items-center justify-center gap-2"
                >
                  IA {selectedBook.current_page === 0 ? '(début)' : `(jusqu'à p.${selectedBook.current_page})`}
                </button>
                <button
                  type="button"
                  onClick={openAddNoteModal}
                  className="w-full py-2 px-4 rounded-xl bg-card-light border border-gray-200 transition-colors text-sm font-medium text-text-main-light flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Ajouter une note
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-col items-center justify-center mb-12 w-full">
            <div className="text-[5rem] leading-none font-bold tabular-nums tracking-tighter text-text-main-light">
              {formatTime(displaySeconds)}
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
              <p className="text-2xl font-bold">{Math.floor(displaySeconds / 60)}m</p>
              <p className="text-xs font-medium text-text-sub-light uppercase tracking-wide">Durée</p>
            </div>
          </div>

          <div className="w-full space-y-2">
            <label
              className={`flex items-center justify-between gap-4 bg-card-light border-2 rounded-full p-2 pl-6 transition-all ${
                pageError ? 'border-red-400 ring-1 ring-red-200' : 'border-gray-200 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary'
              }`}
            >
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
            {pageError && (
              <p className="text-sm text-red-600 font-medium text-right">{pageError}</p>
            )}
          </div>
        </div>
      </div>

      {/* Footer fixé en bas */}
      <div 
        className="fixed left-0 right-0 bottom-0 z-[60] bg-background-light"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
      >
        <div className="max-w-md mx-auto p-6 pt-2">
          <div className="flex items-center gap-4">
            <button
              onClick={togglePause}
              className="size-14 shrink-0 flex items-center justify-center rounded-full bg-card-light text-text-main-light hover:bg-gray-100 transition-colors"
            >
              {isRunning ? <Pause className="w-7 h-7" /> : <Play className="w-7 h-7 ml-1" />}
            </button>

            <button
              onClick={handleFinish}
              disabled={saving || !pageValid}
              className="h-16 flex-1 flex items-center justify-center rounded-full bg-primary hover:brightness-95 transition-all group relative overflow-hidden disabled:opacity-50"
            >
              <span
                className="relative z-10 text-black text-lg font-bold uppercase tracking-wide flex items-center gap-2"
                style={{ color: 'rgba(0, 0, 0, 1)' }}
              >
                {saving ? 'Enregistrement...' : 'Terminer la session'}
              </span>
            </button>

            <button
              onClick={handleDeleteFromFooter}
              className="size-14 shrink-0 flex items-center justify-center rounded-full bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
            >
              <Trash2 className="w-6 h-6" />
            </button>
          </div>
        </div>
      </div>
      {renderModalsAndToast()}
    </div>
  );
}
