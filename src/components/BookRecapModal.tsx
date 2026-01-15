import { useState, useEffect, useRef } from 'react';
import { RefreshCw } from 'lucide-react';
import { useScrollLock } from '../hooks/useScrollLock';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Toast } from './Toast';
import { CenteredModalShell } from './ui/CenteredModalShell';
import { RecapUIState } from '../lib/recapUI';

type RecapData = {
  summary: string;
  ultra_20s: string;
  takeaways: string;
  question?: string;
  answer?: string;
  explanation?: string;
  key_takeaways?: string[];
  key_moments?: Array<{ title: string; detail: string }>;
  challenge?: {
    question: string;
    answer: string;
    explanation: string;
  };
  chapters?: Array<{ title: string; recap: string }>;
  detailed?: string;
  characters?: Array<{
    name: string;
    who: string;
    why_important?: string; // New format
    why?: string; // Backward compatibility
  }>;
  uptoPage?: number;
  meta?: {
    uptoPage: number;
    language: string;
    notesCount: number;
  };
};

interface BookRecapModalProps {
  open: boolean;
  onClose: () => void;
  book: {
    id: string;
    title: string;
    author?: string;
    cover_url?: string | null;
    total_pages?: number | null;
    book_key?: string | null;
    isbn?: string | null;
    openlibrary_key?: string | null;
    google_books_id?: string | null;
  };
  uptoPage: number;
  // Optional controlled mode props (if provided, use controlled mode)
  ui?: RecapUIState;
  setUI?: (updater: (prev: RecapUIState) => RecapUIState) => void;
  loadRecap?: (force?: boolean) => Promise<void>;
  onTabChange?: (tab: 'personnages' | 'takeaways' | 'detaille' | 'defi') => void;
}

export function BookRecapModal({ open, onClose, book, uptoPage, ui, setUI, loadRecap: externalLoadRecap, onTabChange }: BookRecapModalProps) {
  const { user, profile } = useAuth();
  const isControlled = !!ui && !!setUI;
  
  // Local state (used when not in controlled mode)
  const [localRecapLoading, setLocalRecapLoading] = useState(false);
  const [localRecapData, setLocalRecapData] = useState<RecapData | null>(null);
  const [localRecapTab, setLocalRecapTab] = useState<'personnages' | 'takeaways' | 'detaille' | 'defi'>('personnages');
  const [localUserChallengeAnswer, setLocalUserChallengeAnswer] = useState('');
  const [localChallengeResult, setLocalChallengeResult] = useState<null | {
    verdict: 'correct' | 'partial' | 'incorrect';
    points: number;
    feedback: string;
    answer: string;
    explanation?: string;
  }>(null);
  const [localChallengeSubmitting, setLocalChallengeSubmitting] = useState(false);
  const [localRecapError, setLocalRecapError] = useState<{ message: string; requestId: string } | null>(null);
  
  // Use controlled state if provided, otherwise use local state
  const recapLoading = isControlled ? (ui?.recapLoading ?? false) : localRecapLoading;
  const recapData = isControlled ? (ui?.recapData ?? null) : localRecapData;
  const recapTab = isControlled ? (ui?.tab ?? 'personnages') : localRecapTab;
  const userChallengeAnswer = isControlled ? (ui?.userAnswerDraft ?? '') : localUserChallengeAnswer;
  const challengeResult = isControlled ? (ui?.challengeResult ?? null) : localChallengeResult;
  const challengeSubmitting = isControlled ? (ui?.challengeSubmitting ?? false) : localChallengeSubmitting;
  const recapError = isControlled ? (ui?.recapError ?? null) : localRecapError;
  const hasSubmittedChallenge = isControlled ? (ui?.hasSubmittedChallenge ?? false) : false;
  
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);
  // Guard anti double-submit pour éviter un double award XP si l'utilisateur spamme
  const submitGuardRef = useRef(false);
  // ✅ Helper setters (pour éviter setRecapError/setRecapData inexistants)
  const setRecapLoadingState = (v: boolean) => {
    if (isControlled && setUI) setUI(s => ({ ...s, recapLoading: v }));
    else setLocalRecapLoading(v);
  };

  const setRecapDataState = (v: any) => {
    if (isControlled && setUI) setUI(s => ({ ...s, recapData: v }));
    else setLocalRecapData(v);
  };

  const setRecapErrorState = (v: any) => {
    if (isControlled && setUI) setUI(s => ({ ...s, recapError: v }));
    else setLocalRecapError(v);
  };

  const setTabState = (tab: 'personnages' | 'takeaways' | 'detaille' | 'defi') => {
    if (isControlled && setUI) setUI(s => ({ ...s, tab }));
    else setLocalRecapTab(tab);
  };

  const setUserAnswerDraftState = (v: string) => {
    if (isControlled && setUI) setUI(s => ({ ...s, userAnswerDraft: v }));
    else setLocalUserChallengeAnswer(v);
  };

  const setChallengeResultState = (v: any) => {
    if (isControlled && setUI) setUI(s => ({ ...s, challengeResult: v }));
    else setLocalChallengeResult(v);
  };

  // Load recap when modal opens (only in non-controlled mode)
  useEffect(() => {
    if (open && user && !isControlled && !externalLoadRecap) {
      loadRecap(false);
    }
  }, [open, user, isControlled, externalLoadRecap]);

  // Reset states when modal closes (only in non-controlled mode)
  useEffect(() => {
    if (!open && !isControlled) {
      setRecapDataState(null);
      setTabState('personnages');
      setUserAnswerDraftState('');
      setChallengeResultState(null);
      setRecapErrorState(null);
    }
  }, [open, isControlled]);

  // ✅ Anti-race "stale response" propre avec compteur
  const recapReqIdRef = useRef(0);

  const loadRecap = async (force = false) => {
    if (!user) return;
    
    // Use external loadRecap if provided (controlled mode)
    if (externalLoadRecap) {
      await externalLoadRecap(force);
      return;
    }

    // Local mode
    const reqId = ++recapReqIdRef.current;
    setRecapLoadingState(true);
    setRecapDataState(null);
    setRecapErrorState(null);

    try {
      // ✅ Build payload with all available identifiers
      const payload: any = {
        bookId: book.id,
        uptoPage,
        current_page: uptoPage, // Also send as current_page for compatibility
        language: 'fr',
        force,
      };

      // Add book_key if available (OpenLibrary key or other)
      if (book.book_key) {
        payload.book_key = book.book_key;
      } else if (book.openlibrary_key) {
        payload.book_key = book.openlibrary_key;
      }

      // Add isbn if available
      if (book.isbn) {
        payload.isbn = book.isbn;
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
        
        setRecapDataState(fallback);
        setRecapErrorState(null);
        setRecapLoadingState(false);
        return;
      }

      // ✅ Handle Supabase client errors (network, HTTP non-2xx, etc.)
      if (error) {
        const requestId = data?.requestId || data?.meta?.requestId || 'unknown';
        console.warn('[BookRecapModal] Supabase invoke error:', { error, requestId });
        console.log('[BookRecapModal] requestId', requestId);
        const errorMessage = error.message || 'Erreur serveur';
        const errorObj = { 
          message: errorMessage,
          requestId,
        };
        setRecapErrorState(errorObj);
        setRecapLoadingState(false);
        setToast({ 
          message: `${errorMessage} · Code: ${requestId}`, 
          type: 'error' 
        });
        return;
      }

      // ✅ Handle functional errors (ok: false) - mais PAS no_data
      if (data && data.ok === false) {
        const requestId = data.requestId || data.meta?.requestId || 'unknown';
        console.warn('[BookRecapModal] Functional error:', { data, requestId });
        console.log('[BookRecapModal] requestId', requestId);
        
        // Sinon, c'est une vraie erreur fonctionnelle
        const errorMessage = data.error || 'Impossible de charger le rappel';
        const details = data.meta?.details ? ` (${data.meta.details})` : '';
        setRecapErrorState({ 
          message: `${errorMessage}${details}`,
          requestId,
        });
        setRecapLoadingState(false);
        setToast({ 
          message: `${errorMessage}${details} · Code: ${requestId}`, 
          type: 'error' 
        });
        return;
      }

      // ✅ Handle no_data status (cas où ok:true mais status:no_data)
      if (data && data.status === 'no_data') {
        const requestId = data.meta?.requestId || 'unknown';
        console.log('[BookRecapModal] No data available:', { requestId });
        console.log('[BookRecapModal] requestId', requestId);
        setRecapDataState(null);
        setRecapErrorState(null);
        setRecapLoadingState(false);
        // Pas de toast pour no_data - UI affiche "Pas assez d'infos"
        return;
      }

      // ✅ Success: data with ultra_20s
      if (data && data.ultra_20s) {
        const requestId = data.meta?.requestId || 'unknown';
        console.log('[BookRecapModal] Recap loaded:', { requestId });
        console.log('[BookRecapModal] requestId', requestId);
        const newRecapData = {
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
          uptoPage: data.uptoPage || data.meta?.uptoPage || uptoPage,
          meta: data.meta,
        };
        
        setRecapDataState(newRecapData);
        setRecapLoadingState(false);
        setRecapErrorState(null);
        setUserAnswerDraftState('');
        setChallengeResultState(null);
      } else {
        // ✅ No ultra_20s but no error either (shouldn't happen, but handle gracefully)
        const requestId = data?.meta?.requestId || 'unknown';
        console.warn('[BookRecapModal] No ultra_20s in response:', { data, requestId });
        console.log('[BookRecapModal] requestId', requestId);
        setRecapDataState(null);
        setRecapErrorState({ 
          message: 'Réponse invalide du serveur',
          requestId,
        });
        setRecapLoadingState(false);
      }
    } catch (err) {
      // ✅ Only log unexpected errors
      console.error('[BookRecapModal] Unexpected error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Erreur inattendue';
      setRecapErrorState({ 
        message: errorMessage,
        requestId: 'unknown',
      });
      setRecapLoadingState(false);
      setToast({ 
        message: errorMessage, 
        type: 'error' 
      });
    }
  };

  const handleRegenerateRecap = () => {
    loadRecap(true);
  };

  const submitChallenge = async () => {
    // Guard double-submit (click spam, Enter key while pending)
    if (challengeSubmitting || submitGuardRef.current) {
      console.warn('[BookRecapModal] submit blocked: already submitting');
      return;
    }
    submitGuardRef.current = true;
    
    const question = recapData?.challenge?.question || recapData?.question;
    if (!user || !question) return;
    
    if (isControlled && setUI) {
      setUI(s => ({ ...s, challengeSubmitting: true }));
    } else {
      setLocalChallengeSubmitting(true);
    }
    try {
      const { data, error } = await supabase.functions.invoke('book_challenge_answer_v1', {
        body: {
          bookId: book.id,
          uptoPage,
          language: 'fr',
          question,
          summary: recapData?.summary,
          takeaways: recapData?.takeaways,
          ultra_20s: recapData?.ultra_20s,
          userAnswer: userChallengeAnswer,
        },
      });

      if (error) throw error;

      if (data) {
        const result = {
          verdict: data.verdict,
          points: data.points_awarded || 0,
          feedback: data.feedback || '',
          answer: data.answer || '',
          explanation: data.explanation,
        };
        
        if (isControlled && setUI) {
          setUI(s => ({ 
            ...s, 
            challengeResult: result,
            hasSubmittedChallenge: true, // IMPORTANT: prevent modal from closing
            challengeSubmitting: false,
            submittedAnswer: userChallengeAnswer,
            frozenQuestion: question,
          }));
        } else {
          setLocalChallengeResult(result);
        }

        // Award XP + log event (even for 0 XP)
        const amount = Number(data.points_awarded) || 0;
        const verdict = data.verdict as 'correct' | 'partial' | 'incorrect';

        const msg =
          verdict === 'correct'
            ? `Tu as bien répondu au défi`
            : verdict === 'partial'
            ? `Tu as presque bien répondu au défi`
            : `Tu as mal répondu au défi`;

        const { data: newXpTotal, error: xpError } = await supabase.rpc('award_xp_with_event', {
          p_user_id: user.id,
          p_amount: amount,
          p_source: 'book_challenge',
          p_verdict: verdict,
          p_book_id: book.id,
          p_book_title: book.title ?? null,
          p_message: `${msg} · ${book.title}`,
          p_meta: { uptoPage, question },
        });

        if (xpError) {
          console.error('[BookRecapModal] Error awarding XP:', xpError);
          setToast({ message: "Erreur lors de l'attribution des XP", type: 'error' });
        } else {
          // Dispatch xp-updated event (but modal stays open in controlled mode)
          window.dispatchEvent(new CustomEvent('xp-updated', {
            detail: { xp_total: newXpTotal },
          }));

          setToast({
            message: amount > 0 ? `+${amount} XP 🎉` : '0 XP — continue 💪',
            type: amount > 0 ? 'success' : 'info',
          });
        }
      }
    } catch (err) {
      console.error('[BookRecapModal] Error submitting challenge:', err);
      setToast({
        message: err instanceof Error ? err.message : 'Erreur lors de la validation',
        type: 'error',
      });
    } finally {
      if (isControlled && setUI) {
        setUI(s => ({ ...s, challengeSubmitting: false }));
      } else {
        setLocalChallengeSubmitting(false);
      }
      submitGuardRef.current = false;
    }
  };

  useScrollLock(open);

  if (!open) return null;

  // Custom header content (will be placed in body since CenteredModalShell header is simple)
  const headerContent = (
    <div className="mb-3">
      <h2 className="text-lg font-bold text-text-main-light">Rappel – {book.title}</h2>
      <p className="text-xs text-text-sub-light mt-0.5">
                  {uptoPage === 0 ? 'Début du livre' : `Jusqu'à la page ${uptoPage}`}
                </p>
      <p className="text-[10px] text-text-sub-light mt-1 italic leading-relaxed">
                  Zéro spoiler au-delà de ta page.
                </p>
              </div>
  );

  const footerContent = (
    <div className="flex gap-3">
      <button
        type="button"
        onClick={handleRegenerateRecap}
        disabled={recapLoading}
        className="flex-1 py-3 px-4 rounded-lg bg-white hover:bg-gray-100 dark:bg-[rgba(23,23,24,1)] dark:hover:bg-[rgba(35,35,37,1)] transition-colors text-sm font-medium text-[rgba(161,161,170,1)] dark:text-text-main-light disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {recapLoading ? (
          <>
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span>Régénération...</span>
          </>
        ) : (
          <>
            <RefreshCw className="w-4 h-4" />
            <span>Régénérer</span>
          </>
        )}
      </button>
              <button
                type="button"
                onClick={onClose}
        disabled={recapLoading}
        className="flex-1 py-3 px-4 rounded-lg bg-black hover:bg-gray-800 transition-colors text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
        Fermer
              </button>
            </div>
  );

  return (
    <>
      <CenteredModalShell
        onClose={onClose}
        footer={footerContent}
        bodyClassName="px-4 py-3"
      >
        {headerContent}
          {/* Tab selector */}
        <div className="px-0 pt-0 pb-2 border-b border-border mb-3">
            <div className="flex gap-1.5 bg-surface-2 rounded-lg p-1">
              {(['personnages', 'takeaways', 'detaille', 'defi'] as const).map((tab) => {
                const isDefi = tab === 'defi';
                const isActive = recapTab === tab;
                return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => {
                    if (onTabChange) {
                      onTabChange(tab);
                    }
                    setTabState(tab);
                    setUserAnswerDraftState('');
                    setChallengeResultState(null);
                  }}
                  disabled={recapLoading}
                  className={`flex-1 py-2 px-2 rounded-md text-xs font-medium transition-all disabled:opacity-50 ${
                    isActive
                      ? 'bg-[#e7ff0b] text-black hover:text-black font-semibold shadow-sm'
                      : 'bg-transparent text-text-sub-light hover:text-text-main-light'
                  }`}
                  style={isActive ? { color: 'rgba(0, 0, 0, 1)' } : undefined}
                >
                    {tab === 'personnages' ? 'Personnages' : tab === 'takeaways' ? 'À retenir' : tab === 'detaille' ? 'Détaillé' : 'Défi'}
                </button>
                );
              })}
            </div>
          </div>

          {/* Content */}
            {recapLoading ? (
              <div className="flex flex-col items-center justify-center py-12">
                <RefreshCw className="w-8 h-8 animate-spin text-gray-400 mb-3" />
                <p className="text-sm font-medium text-text-main-light mb-1">Génération du rappel…</p>
                <p className="text-xs text-text-sub-light">Ça prend 2–5 secondes.</p>
              </div>
            ) : recapError ? (
              <div className="text-center py-12 px-4">
                <p className="text-text-main-light font-medium mb-2">Erreur lors du chargement</p>
                <p className="text-sm text-text-sub-light mb-4">
                  {recapError.message}
                </p>
                {recapError.requestId && recapError.requestId !== 'unknown' && (
                  <p className="text-xs text-text-sub-light mb-6">
                    Code: {recapError.requestId}
                  </p>
                )}
                <div className="flex gap-3 justify-center">
                  <button
                    type="button"
                    onClick={() => loadRecap(true)}
                    className="px-6 py-2.5 rounded-lg bg-black hover:bg-gray-800 transition-colors text-sm font-semibold text-white"
                  >
                    Réessayer
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-6 py-2.5 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors text-sm font-medium text-text-main-light"
                  >
                    Fermer
                  </button>
                </div>
              </div>
            ) : !recapData ? (
              <div className="text-center py-12 px-4">
                <p className="text-text-main-light font-medium mb-2">Pas assez d'infos pour générer un rappel</p>
                <p className="text-sm text-text-sub-light mb-6">
                  Ajoute une note ou termine une session pour enrichir le rappel.
                </p>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-2.5 rounded-lg bg-black hover:bg-gray-800 transition-colors text-sm font-semibold text-white"
                >
                  Fermer
                </button>
              </div>
            ) : (
              <div className="text-text-main-light leading-relaxed">
                {recapTab === 'personnages' && (
                  <div>
                    <p className="text-xs font-semibold text-text-sub-light uppercase tracking-wide mb-2">Personnages</p>
                    {recapData.characters && recapData.characters.length > 0 ? (
                      <div className="space-y-3">
                        {recapData.characters.map((character, idx) => {
                          const whyText = character.why_important || character.why || "";
                          return (
                            <div key={idx} className="border-b border-border pb-3 last:border-0 last:pb-0">
                              <p className="font-bold text-sm text-text-main-light mb-0.5">{character.name}</p>
                              <p className="text-xs text-text-main-light mb-1.5 leading-relaxed line-clamp-2">{character.who}</p>
                              {whyText && (
                                <p className="text-xs text-text-sub-light italic leading-relaxed line-clamp-2">{whyText}</p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : recapData.summary ? (
                      <div className="text-center py-8">
                        <p className="text-text-main-light font-medium mb-1">Personnages non extraits</p>
                        <p className="text-xs text-text-sub-light mb-4">Régénère le rappel pour extraire les personnages.</p>
                        <button
                          type="button"
                          onClick={() => loadRecap(true)}
                          className="px-6 py-2.5 rounded-lg bg-black hover:bg-gray-800 transition-colors text-sm font-semibold text-white"
                        >
                          Régénérer
                        </button>
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <p className="text-text-main-light font-medium mb-1">Aucun personnage disponible pour le moment.</p>
                        <p className="text-xs text-text-sub-light">Termine une session ou ajoute une note pour améliorer le rappel.</p>
                      </div>
                    )}
                  </div>
                )}
                {recapTab === 'takeaways' && (
                  <div>
                    <p className="text-xs font-semibold text-text-sub-light uppercase tracking-wide mb-2">Points clés à retenir</p>
                    {recapData.key_takeaways && recapData.key_takeaways.length > 0 ? (
                      <>
                        <ul className="space-y-2">
                          {recapData.key_takeaways.map((takeaway, idx) => (
                            <li key={idx} className="flex items-start gap-2">
                              <span className="text-text-main-light mt-1 text-base leading-none">•</span>
                              <span className="flex-1 text-sm leading-relaxed">{takeaway}</span>
                          </li>
                        ))}
                      </ul>
                        {recapData.key_takeaways.length < 5 && (
                          <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                            <p className="text-xs text-yellow-800">
                              <strong>Astuce :</strong> Régénère pour obtenir plus de points clés ({recapData.key_takeaways.length}/5 minimum).
                            </p>
                          </div>
                        )}
                      </>
                    ) : recapData.takeaways ? (
                      <div className="text-sm leading-relaxed">
                        {/* Parse takeaways string to extract bullet points if formatted as list */}
                        {recapData.takeaways.includes('•') || recapData.takeaways.includes('-') ? (
                          <ul className="space-y-2.5">
                            {recapData.takeaways
                              .split(/\n|(?=[•-])/)
                              .map((line) => line.trim())
                              .filter((line) => line.length > 0 && (line.startsWith('•') || line.startsWith('-')))
                              .map((line, idx) => {
                                // Remove bullet marker and clean up
                                const cleanLine = line.replace(/^[•-]\s*/, '').trim();
                                return cleanLine.length > 0 ? (
                                  <li key={idx} className="flex items-start gap-3">
                                    <span className="text-text-main-light mt-1.5 text-lg leading-none">•</span>
                                    <span className="flex-1 text-sm leading-relaxed">{cleanLine}</span>
                                  </li>
                                ) : null;
                              })
                              .filter(Boolean)}
                          </ul>
                        ) : (
                          // If not formatted as list, display as plain text (removing any title repetition)
                          <div className="whitespace-pre-wrap">
                            {recapData.takeaways
                              .replace(/^Points?\s+clés?\s+(à\s+retenir)?[:\-]?\s*/i, '')
                              .replace(/^Points?\s+clés?[:\-]?\s*/i, '')
                              .trim()}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <p className="text-text-main-light font-medium mb-1">Aucun point clé disponible pour le moment.</p>
                        <p className="text-xs text-text-sub-light">Termine une session ou ajoute une note pour améliorer le rappel.</p>
                      </div>
                    )}
                  </div>
                )}
                {recapTab === 'defi' && (() => {
                  const question = recapData?.challenge?.question || recapData?.question;
                  
                  if (!question) {
                    return (
                      <div className="text-center py-8">
                        <p className="text-text-main-light font-medium mb-1">Aucun défi disponible pour le moment.</p>
                        <p className="text-xs text-text-sub-light">Termine une session ou ajoute une note pour améliorer le rappel.</p>
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-4">
                    <div className="rounded-xl p-4 bg-white border-0 dark:bg-[#161618] dark:border dark:border-[#2d2f36]">
                        <p className="text-[10px] font-semibold text-text-main-light uppercase tracking-wider mb-3">DÉFI COMPRÉHENSION</p>
                        <p className="text-lg font-bold text-text-main-light leading-tight">{question}</p>
                        <p className="text-[10px] text-text-sub-light mt-2 italic">Zéro spoiler — basé sur ton avancée.</p>
                      </div>
                      
                      <div className="space-y-3">
                        {!challengeResult ? (
                          <>
                            <div className="rounded-lg p-4 bg-white border-0 dark:bg-[#0f0f11] dark:border dark:border-[#2d2f36]">
                              <label className="block text-xs font-semibold text-text-sub-light uppercase tracking-wide mb-2">
                                Ta réponse (optionnel)
                              </label>
                              <textarea
                                value={userChallengeAnswer}
                                onChange={(e) => {
                                  if (isControlled && setUI) {
                                    setUI(s => ({ ...s, userAnswerDraft: e.target.value }));
                                  } else {
                                    setLocalUserChallengeAnswer(e.target.value);
                                  }
                                }}
                                placeholder=""
                                rows={2}
                                className="w-full px-3 py-2 rounded-lg focus:border-primary focus:ring-1 focus:ring-primary outline-none resize-none text-sm text-text-main-light bg-white border border-[#e5e7eb] dark:bg-[#111111] dark:border-[#2d2f36] dark:placeholder-[#9ca3af]"
                              />
                            </div>
                            
                            <button
                              type="button"
                              onClick={submitChallenge}
                              disabled={challengeSubmitting || !!challengeResult}
                              className="w-full py-3 px-4 rounded-lg bg-primary hover:brightness-95 transition-colors text-sm font-bold text-black disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                              {challengeSubmitting ? (
                                <>
                                  <RefreshCw className="w-4 h-4 animate-spin" />
                                  Validation...
                                </>
                              ) : (
                                'Valider'
                              )}
                            </button>
                          </>
                        ) : (
                          <>
                            {/* Badge verdict */}
                            <div className={`p-3 rounded-lg ${
                              challengeResult.verdict === 'correct'
                                ? 'border-2 bg-green-50 border-green-200'
                                : challengeResult.verdict === 'partial'
                                ? 'border-2 bg-primary/20 border-primary/40'
                                : 'bg-[#161618] border-0'
                            }`}>
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="text-lg">
                                    {challengeResult.verdict === 'correct' ? '✅' : challengeResult.verdict === 'partial' ? '🟡' : '❌'}
                                  </span>
                                  <span className="text-sm font-semibold text-text-main-light dark:text-black">
                                    {challengeResult.verdict === 'correct' ? 'Correct' : challengeResult.verdict === 'partial' ? 'Presque' : 'Faux'}
                                  </span>
                                </div>
                                {challengeResult.points > 0 && (
                                  <span
                                    style={{
                                      background: "#111827",
                                      color: "#FBBF24",
                                      border: "1px solid rgba(251,191,36,0.35)",
                                      padding: "4px 10px",
                                      borderRadius: 999,
                                      fontWeight: 800,
                                      fontSize: 12,
                                      lineHeight: "16px",
                                      boxShadow: "0 0 0 2px rgba(251,191,36,0.10)",
                                    }}
                                  >
                                    +{challengeResult.points} XP
                                  </span>
                                )}
                              </div>
                              {challengeResult.feedback && (
                                <p className="text-xs text-text-sub-light mt-2">{challengeResult.feedback}</p>
                              )}
                            </div>
                            
                            {/* Réponse */}
                            <div className="rounded-lg p-4 bg-white border-0 dark:bg-[#0f0f11] dark:border dark:border-[#2d2f36]">
                              <p className="text-xs font-semibold text-text-sub-light uppercase tracking-wide mb-2">Réponse</p>
                              <p className="text-sm text-text-main-light dark:text-white leading-relaxed">{challengeResult.answer}</p>
                            </div>
                            
                            {/* Explication */}
                            {challengeResult.explanation && (
                              <div className="rounded-lg p-4 bg-white border-0 dark:bg-[#0f0f11] dark:border dark:border-[#2d2f36]">
                                <p className="text-xs font-semibold text-[var(--tw-ring-offset-color)] dark:text-white uppercase tracking-wide mb-2">Pourquoi ?</p>
                                <p className="text-sm text-text-main-light dark:text-white leading-relaxed">{challengeResult.explanation}</p>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })()}
                {recapTab === 'detaille' && (
                  <div>
                    {recapData.chapters && recapData.chapters.length > 0 ? (
                      <div className="space-y-5">
                        {recapData.chapters.map((chapter, idx) => (
                          <div key={idx} className="border-b border-gray-200 pb-4 last:border-0 last:pb-0">
                            <p className="font-bold text-base text-text-main-light mb-2">{chapter.title}</p>
                            <p className="text-sm text-text-sub-light leading-relaxed whitespace-pre-wrap line-clamp-5">{chapter.recap}</p>
                          </div>
                        ))}
                      </div>
                    ) : recapData.detailed ? (
                      <div className="whitespace-pre-wrap text-sm leading-relaxed text-text-sub-light">{recapData.detailed}</div>
                    ) : recapData.key_moments && recapData.key_moments.length > 0 ? (
                      <div className="space-y-4">
                        {recapData.key_moments.map((moment, idx) => (
                          <div key={idx} className="border-l-2 border-gray-300 pl-4 py-2">
                            <p className="font-semibold text-sm text-text-main-light mb-1">{moment.title}</p>
                            <p className="text-sm text-text-sub-light leading-relaxed">{moment.detail}</p>
                          </div>
                        ))}
                      </div>
                    ) : recapData.summary ? (
                      <div className="whitespace-pre-wrap text-sm leading-relaxed text-text-sub-light">{recapData.summary}</div>
                    ) : (
                      <div className="text-center py-8">
                        <p className="text-text-main-light font-medium mb-1">Détails indisponibles pour l'instant.</p>
                        <p className="text-xs text-text-sub-light">Lis encore un peu ou ajoute une note.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
      </CenteredModalShell>

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
}

