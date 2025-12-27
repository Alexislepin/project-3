import { useState, useEffect } from 'react';
import { X, RefreshCw } from 'lucide-react';
import { useScrollLock } from '../hooks/useScrollLock';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Toast } from './Toast';

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
  };
  uptoPage: number;
}

export function BookRecapModal({ open, onClose, book, uptoPage }: BookRecapModalProps) {
  const { user } = useAuth();
  const [recapLoading, setRecapLoading] = useState(false);
  const [recapData, setRecapData] = useState<RecapData | null>(null);
  const [recapTab, setRecapTab] = useState<'20s' | 'takeaways' | 'defi' | 'detaille'>('20s');
  const [userChallengeAnswer, setUserChallengeAnswer] = useState('');
  const [challengeResult, setChallengeResult] = useState<null | {
    verdict: 'correct' | 'partial' | 'incorrect';
    points: number;
    feedback: string;
    answer: string;
    explanation?: string;
  }>(null);
  const [challengeSubmitting, setChallengeSubmitting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  // Load recap when modal opens
  useEffect(() => {
    if (open && user) {
      loadRecap(false);
    }
  }, [open, user]);

  // Reset states when modal closes
  useEffect(() => {
    if (!open) {
      setRecapData(null);
      setRecapTab('20s');
      setUserChallengeAnswer('');
      setChallengeResult(null);
    }
  }, [open]);

  const loadRecap = async (force = false) => {
    if (!user) return;

    setRecapLoading(true);
    setRecapData(null);

    try {
      const { data, error } = await supabase.functions.invoke('book_recap_v2', {
        body: {
          bookId: book.id,
          uptoPage,
          language: 'fr',
          force,
        },
      });

      if (error) {
        console.error('[BookRecapModal] Error loading recap:', error);
        const errorMessage = error.message || 'Impossible de charger le rappel';
        setToast({ message: errorMessage, type: 'error' });
        if (error.status === 500 || error.message?.includes('500')) {
          alert(`Erreur serveur (500): ${errorMessage}`);
        }
        return;
      }

      if (data?.error) {
        const errorMessage = data.error || 'Impossible de charger le rappel';
        setToast({ message: errorMessage, type: 'error' });
        alert(`Erreur: ${errorMessage}`);
        return;
      }

      if (data?.ultra_20s) {
        setRecapData({
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
          uptoPage: data.uptoPage || data.meta?.uptoPage,
          meta: data.meta,
        });
        setRecapTab('20s');
        setUserChallengeAnswer('');
        setChallengeResult(null);
      } else {
        setRecapData(null);
      }
    } catch (err) {
      console.error('[BookRecapModal] Error loading recap:', err);
      const errorMessage = err instanceof Error ? err.message : 'Impossible de charger le rappel';
      setToast({ message: errorMessage, type: 'error' });
      alert(`Erreur: ${errorMessage}`);
    } finally {
      setRecapLoading(false);
    }
  };

  const handleRegenerateRecap = () => {
    loadRecap(true);
  };

  const submitChallenge = async () => {
    const question = recapData?.challenge?.question || recapData?.question;
    if (!user || !question) return;
    
    setChallengeSubmitting(true);
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
        setChallengeResult({
          verdict: data.verdict,
          points: data.points_awarded || 0,
          feedback: data.feedback || '',
          answer: data.answer || '',
          explanation: data.explanation,
        });

        // Award XP if points > 0
        if (data.points_awarded > 0) {
          const { error: xpError } = await supabase.rpc('award_xp', {
            points: data.points_awarded,
          });

          if (xpError) {
            console.error('[BookRecapModal] Error awarding XP:', xpError);
          } else {
            // Dispatch event for UI refresh
            window.dispatchEvent(new CustomEvent('xp-updated', {
              detail: { xp_total: data.xp_total_updated },
            }));
            setToast({
              message: `+${data.points_awarded} points 🎉`,
              type: 'success',
            });
          }
        } else {
          setToast({
            message: '0 point — continue 💪',
            type: 'info',
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
      setChallengeSubmitting(false);
    }
  };

  useScrollLock(open);

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 z-[200] flex items-center justify-center p-4"
        data-modal-overlay
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            onClose();
          }
        }}
        onTouchMove={(e) => {
          // Prevent scroll on overlay
          const target = e.target as HTMLElement;
          if (!target.closest('[data-modal-content]')) {
            e.preventDefault();
          }
        }}
      >
        <div 
          data-modal-content
          className="bg-white rounded-2xl max-w-lg w-full flex flex-col overflow-hidden shadow-xl"
          style={{
            maxHeight: 'calc(100dvh - 24px - env(safe-area-inset-top) - env(safe-area-inset-bottom))'
          }}
        >
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-gray-200 p-4 rounded-t-2xl">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h2 className="text-xl font-bold text-text-main-light">Rappel – {book.title}</h2>
                <p className="text-sm text-text-sub-light mt-1">
                  {uptoPage === 0 ? 'Début du livre' : `Jusqu'à la page ${uptoPage}`}
                </p>
                <p className="text-[10px] text-text-sub-light mt-1.5 italic leading-relaxed">
                  Zéro spoiler au-delà de ta page.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 transition-colors ml-4"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>

          {/* Tab selector */}
          <div className="px-4 pt-4 pb-2 border-b border-gray-100">
            <div className="flex gap-1.5 bg-gray-100 rounded-lg p-1">
              {(['20s', 'takeaways', 'defi', 'detaille'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => {
                    setRecapTab(tab);
                    setUserChallengeAnswer('');
                    setChallengeResult(null);
                  }}
                  disabled={recapLoading}
                  className={`flex-1 py-2 px-2 rounded-md text-xs font-medium transition-all disabled:opacity-50 ${
                    recapTab === tab
                      ? 'bg-black text-white font-semibold shadow-sm'
                      : 'text-text-sub-light hover:text-text-main-light'
                  }`}
                >
                  {tab === '20s' ? '20s' : tab === 'takeaways' ? 'À retenir' : tab === 'defi' ? 'Défi' : 'Détaillé'}
                </button>
              ))}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 min-h-0" style={{ WebkitOverflowScrolling: 'touch' }}>
            {recapLoading ? (
              <div className="flex flex-col items-center justify-center py-12">
                <RefreshCw className="w-8 h-8 animate-spin text-gray-400 mb-3" />
                <p className="text-sm font-medium text-text-main-light mb-1">Génération du rappel…</p>
                <p className="text-xs text-text-sub-light">Ça prend 2–5 secondes.</p>
              </div>
            ) : !recapData || !recapData.ultra_20s ? (
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
                {recapTab === '20s' && (
                  <div>
                    <p className="text-xs font-semibold text-text-sub-light uppercase tracking-wide mb-3">Résumé express</p>
                    {recapData.ultra_20s ? (
                      <p className="text-base leading-relaxed">{recapData.ultra_20s.split('\n').slice(0, 2).join('\n')}</p>
                    ) : (
                      <div className="text-center py-8">
                        <p className="text-text-main-light font-medium mb-1">Pas assez d'infos pour résumer pour l'instant.</p>
                        <p className="text-xs text-text-sub-light">Ajoute une note après ta session pour enrichir le rappel.</p>
                      </div>
                    )}
                  </div>
                )}
                {recapTab === 'takeaways' && (
                  <div>
                    <p className="text-xs font-semibold text-text-sub-light uppercase tracking-wide mb-3">Points clés</p>
                    {recapData.key_takeaways && recapData.key_takeaways.length > 0 ? (
                      <ul className="space-y-2.5">
                        {recapData.key_takeaways.slice(0, 6).map((takeaway, idx) => (
                          <li key={idx} className="flex items-start gap-3">
                            <span className="text-text-main-light mt-1.5 text-lg leading-none">•</span>
                            <span className="flex-1 text-sm leading-relaxed line-clamp-2">{takeaway}</span>
                          </li>
                        ))}
                      </ul>
                    ) : recapData.takeaways ? (
                      <div className="whitespace-pre-wrap text-sm">{recapData.takeaways}</div>
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
                      <div className="bg-gray-100 rounded-xl p-4">
                        <p className="text-[10px] font-semibold text-text-main-light uppercase tracking-wider mb-3">DÉFI COMPRÉHENSION</p>
                        <p className="text-lg font-bold text-text-main-light leading-tight">{question}</p>
                        <p className="text-[10px] text-text-sub-light mt-2 italic">Zéro spoiler — basé sur ton avancée.</p>
                      </div>
                      
                      <div className="space-y-3">
                        {!challengeResult ? (
                          <>
                            <div className="bg-[#f5f5f7] border border-[#e5e7eb] rounded-lg p-4">
                              <label className="block text-xs font-semibold text-text-sub-light uppercase tracking-wide mb-2">
                                Ta réponse (optionnel)
                              </label>
                              <textarea
                                value={userChallengeAnswer}
                                onChange={(e) => setUserChallengeAnswer(e.target.value)}
                                placeholder="Ta réponse (optionnel)"
                                rows={2}
                                className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-primary focus:ring-1 focus:ring-primary outline-none resize-none text-sm text-text-main-light bg-white"
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
                            <div className={`p-3 rounded-lg border-2 ${
                              challengeResult.verdict === 'correct'
                                ? 'bg-green-50 border-green-200'
                                : challengeResult.verdict === 'partial'
                                ? 'bg-primary/20 border-primary/40'
                                : 'bg-gray-50 border-gray-200'
                            }`}>
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="text-lg">
                                    {challengeResult.verdict === 'correct' ? '✅' : challengeResult.verdict === 'partial' ? '🟡' : '❌'}
                                  </span>
                                  <span className="text-sm font-semibold text-text-main-light">
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
                            <div className="bg-[#f5f5f7] border border-[#e5e7eb] rounded-lg p-4">
                              <p className="text-xs font-semibold text-text-sub-light uppercase tracking-wide mb-2">Réponse</p>
                              <p className="text-sm text-[#111] leading-relaxed">{challengeResult.answer}</p>
                            </div>
                            
                            {/* Explication */}
                            {challengeResult.explanation && (
                              <div className="bg-[#f5f5f7] border border-[#e5e7eb] rounded-lg p-4">
                                <p className="text-xs font-semibold text-text-sub-light uppercase tracking-wide mb-2">Pourquoi ?</p>
                                <p className="text-sm text-[#111] leading-relaxed">{challengeResult.explanation}</p>
                              </div>
                            )}
                            
                            {/* Bouton Rejouer */}
                            <button
                              type="button"
                              onClick={() => {
                                setChallengeResult(null);
                                setUserChallengeAnswer('');
                              }}
                              className="w-full py-2.5 px-4 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors text-sm font-medium text-text-main-light flex items-center justify-center gap-2"
                            >
                              Rejouer
                            </button>
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
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 bg-white border-t border-gray-200 p-4 flex gap-3 rounded-b-2xl">
            <button
              type="button"
              onClick={handleRegenerateRecap}
              disabled={recapLoading}
              className="flex-1 py-2.5 px-4 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors text-sm font-medium text-text-main-light disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {recapLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Régénération...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  Régénérer
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={recapLoading}
              className="flex-1 py-2.5 px-4 rounded-lg bg-black hover:bg-gray-800 transition-colors text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Fermer
            </button>
          </div>
        </div>
      </div>

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

