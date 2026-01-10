import { useState, useEffect } from 'react';
import { BookOpen, X, ChevronRight } from 'lucide-react';
import { useScrollLock } from '../hooks/useScrollLock';

interface ReadingSetupModalProps {
  open: boolean;
  bookTitle: string;
  initialStatus: 'reading' | 'completed' | 'want_to_read';
  initialTotalPages?: number | null; // From books.total_pages or API
  initialCurrentPage?: number | null; // Pre-filled if known
  onConfirm: (data: {
    status: 'reading' | 'completed' | 'want_to_read';
    total_pages: number | null;
    current_page: number;
  }) => void;
  onCancel: () => void;
}

type Step = 'total_pages' | 'current_page' | 'confirm';

/**
 * Modal for setting up reading state when adding a book
 * Handles:
 * - Asking for total_pages if missing
 * - Asking for current_page if status is 'reading'
 * - Auto-setting current_page for 'completed' and 'want_to_read'
 */
export function ReadingSetupModal({
  open,
  bookTitle,
  initialStatus,
  initialTotalPages,
  initialCurrentPage,
  onConfirm,
  onCancel,
}: ReadingSetupModalProps) {
  const [step, setStep] = useState<Step>('total_pages');
  const [totalPages, setTotalPages] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // Initialize state when modal opens or props change
  useEffect(() => {
    if (open) {
      setError(null);
      // Initialize totalPages if known
      if (initialTotalPages && initialTotalPages > 0) {
        setTotalPages(String(initialTotalPages));
      } else {
        setTotalPages('');
      }
      // Initialize currentPage if known
      if (initialCurrentPage !== undefined && initialCurrentPage !== null) {
        setCurrentPage(String(initialCurrentPage));
      } else {
        setCurrentPage('');
      }
      // Determine initial step
      if (initialTotalPages && initialTotalPages > 0) {
        // Total pages known, check if we need current_page
        if (initialStatus === 'reading') {
          setStep(initialCurrentPage !== undefined && initialCurrentPage !== null ? 'confirm' : 'current_page');
        } else {
          setStep('confirm');
        }
      } else {
        // Need to ask for total_pages
        setStep('total_pages');
      }
    }
  }, [open, initialStatus, initialTotalPages, initialCurrentPage]);

  // Reset form when status changes
  useEffect(() => {
    if (open) {
      if (initialStatus === 'want_to_read') {
        // Auto-set current_page to 0
        setCurrentPage('0');
      } else if (initialStatus === 'completed') {
        // Auto-set current_page to total_pages if known
        if (totalPages && parseInt(totalPages, 10) > 0) {
          setCurrentPage(totalPages);
        }
      }
    }
  }, [open, initialStatus, totalPages]);

  // Lock scroll when modal is open
  useScrollLock(open);

  if (!open) return null;

  const handleTotalPagesNext = () => {
    setError(null);
    const pages = parseInt(totalPages.trim(), 10);
    
    if (!totalPages.trim()) {
      setError('Le nombre de pages est obligatoire');
      return;
    }

    if (isNaN(pages) || pages < 1) {
      setError('Le nombre de pages doit être au moins 1');
      return;
    }

    // Set current_page based on status
    if (initialStatus === 'completed') {
      setCurrentPage(String(pages));
      setStep('confirm');
    } else if (initialStatus === 'reading') {
      // Pre-fill with initialCurrentPage if available
      if (initialCurrentPage !== undefined && initialCurrentPage !== null) {
        setCurrentPage(String(initialCurrentPage));
        setStep('confirm');
      } else {
        setStep('current_page');
      }
    } else {
      // want_to_read
      setCurrentPage('0');
      setStep('confirm');
    }
  };

  const handleCurrentPageNext = () => {
    setError(null);
    const page = parseInt(currentPage.trim(), 10);
    const total = parseInt(totalPages.trim(), 10);

    if (!currentPage.trim()) {
      if (initialStatus === 'reading') {
        setError('La page actuelle est obligatoire pour "En cours"');
        return;
      }
      setCurrentPage('0');
      handleConfirm();
      return;
    }

    if (isNaN(page) || page < 0) {
      setError('La page doit être un nombre positif');
      return;
    }

    // Allow 0 for reading status (user hasn't started yet)
    // But we won't create an activity if pages_delta <= 1
    if (initialStatus === 'reading' && page === 0) {
      // Allow 0, just continue
    }

    if (total > 0 && page > total) {
      setError(`La page ne peut pas dépasser ${total} (nombre total de pages)`);
      return;
    }

    setStep('confirm');
  };

  const handlePresetPage = (preset: number) => {
    setCurrentPage(String(preset));
    setError(null);
  };

  const handleConfirm = () => {
    setError(null);
    
    const total = totalPages.trim() ? parseInt(totalPages.trim(), 10) : null;
    const current = currentPage.trim() ? parseInt(currentPage.trim(), 10) : 0;

    // Final validation
    // If status is 'reading', total_pages is REQUIRED
    if (initialStatus === 'reading') {
      if (!totalPages.trim() || !total || isNaN(total) || total < 1) {
        setError('Le nombre total de pages est obligatoire pour "En cours"');
        return;
      }
    } else if (total !== null && (isNaN(total) || total < 1)) {
      setError('Le nombre total de pages doit être au moins 1');
      return;
    }

    // If status is 'reading', current_page is REQUIRED (can be 0)
    if (initialStatus === 'reading') {
      if (currentPage.trim() === '' || isNaN(current) || current < 0) {
        setError('La page actuelle est obligatoire pour "En cours"');
        return;
      }
    } else if (isNaN(current) || current < 0) {
      setError('La page actuelle doit être un nombre positif');
      return;
    }

    // Allow 0 for reading status (user hasn't started yet)
    // But we won't create an activity if pages_delta <= 1
    if (initialStatus === 'reading' && current === 0) {
      // Allow 0, just continue
    }

    if (total !== null && current > total) {
      setError(`La page ne peut pas dépasser ${total}`);
      return;
    }

    // Normalize based on status
    let finalCurrentPage = current;
    if (initialStatus === 'completed' && total !== null) {
      finalCurrentPage = total; // Force to total_pages for completed
    } else if (initialStatus === 'want_to_read') {
      finalCurrentPage = 0; // Force to 0 for want_to_read
    }

    onConfirm({
      status: initialStatus,
      total_pages: total,
      current_page: finalCurrentPage,
    });
  };

  const renderTotalPagesStep = () => (
    <div>
      <div className="mb-6">
        <label className="block text-sm font-semibold text-text-main-light mb-2">
          Nombre total de pages
        </label>
        <input
          type="number"
          min={1}
          value={totalPages}
          onChange={(e) => {
            setTotalPages(e.target.value);
            setError(null);
          }}
          placeholder="Ex: 250"
          className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-lg font-sans text-text-main-light placeholder:text-text-sub-light/60"
          autoFocus
        />
        {error && (
          <p className="mt-2 text-sm text-red-600 font-sans">{error}</p>
        )}
      </div>

      <div className="flex gap-3">
        <button
          onClick={onCancel}
          className="flex-1 py-3 px-4 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-colors font-sans"
        >
          Annuler
        </button>
        <button
          onClick={handleTotalPagesNext}
          className="flex-1 py-3 px-4 bg-primary text-black rounded-xl font-semibold hover:brightness-95 transition-all font-sans flex items-center justify-center gap-2"
        >
          Continuer
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  const renderCurrentPageStep = () => {
    const total = parseInt(totalPages.trim(), 10);
    const presets = [0, 1, 5, 10, 50, 100].filter(p => total > 0 ? p <= total : true);

    return (
      <div>
        <div className="mb-6">
          <label className="block text-sm font-semibold text-text-main-light mb-2">
            Tu en es à quelle page ?
          </label>
          <input
            type="number"
            min={1}
            max={total > 0 ? total : undefined}
            value={currentPage}
            onChange={(e) => {
              setCurrentPage(e.target.value);
              setError(null);
            }}
            placeholder={total > 0 ? `1 à ${total}` : '1'}
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-lg font-sans text-text-main-light placeholder:text-text-sub-light/60 mb-3"
            autoFocus
          />
          
          {/* Presets */}
          <div className="flex flex-wrap gap-2 mb-3">
            {presets.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => handlePresetPage(preset)}
                className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
              >
                {preset}
              </button>
            ))}
            {total > 0 && (
              <button
                type="button"
                onClick={() => handlePresetPage(total)}
                className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-200 transition-colors"
              >
                Dernière page ({total})
              </button>
            )}
          </div>

          {total > 0 && (
            <p className="text-xs text-text-sub-light/70 mb-2">
              Ce livre a {total} pages au total
            </p>
          )}
          {error && (
            <p className="mt-2 text-sm text-red-600 font-sans">{error}</p>
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => setStep('total_pages')}
            className="flex-1 py-3 px-4 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-colors font-sans"
          >
            Retour
          </button>
          <button
            onClick={handleCurrentPageNext}
            className="flex-1 py-3 px-4 bg-primary text-black rounded-xl font-semibold hover:brightness-95 transition-all font-sans flex items-center justify-center gap-2"
          >
            Continuer
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  };

  const renderConfirmStep = () => {
    const total = totalPages.trim() ? parseInt(totalPages.trim(), 10) : null;
    const current = currentPage.trim() ? parseInt(currentPage.trim(), 10) : 0;
    
    const statusLabels = {
      reading: 'En cours de lecture',
      completed: 'Terminé',
      want_to_read: 'À lire',
    };

    return (
      <div>
        <div className="mb-6 p-4 bg-gray-50 rounded-xl">
          <h4 className="text-sm font-semibold text-text-main-light mb-3">Résumé</h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-text-sub-light">Statut:</span>
              <span className="font-semibold text-text-main-light">{statusLabels[initialStatus]}</span>
            </div>
            {total && (
              <div className="flex justify-between">
                <span className="text-text-sub-light">Pages totales:</span>
                <span className="font-semibold text-text-main-light">{total}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-text-sub-light">Page actuelle:</span>
              <span className="font-semibold text-text-main-light">
                {initialStatus === 'completed' && total ? total : current}
              </span>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl">
            <p className="text-sm text-red-600 font-sans">{error}</p>
          </div>
        )}

        <div className="flex gap-3">
          {step !== 'total_pages' && (
            <button
              onClick={() => {
                if (initialStatus === 'reading') {
                  setStep('current_page');
                } else {
                  setStep('total_pages');
                }
              }}
              className="flex-1 py-3 px-4 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-colors font-sans"
            >
              Retour
            </button>
          )}
          <button
            onClick={handleConfirm}
            className="flex-1 py-3 px-4 bg-primary text-black rounded-xl font-semibold hover:brightness-95 transition-all font-sans"
          >
            Valider
          </button>
        </div>
      </div>
    );
  };

  const getStepTitle = () => {
    switch (step) {
      case 'total_pages':
        return 'Combien de pages au total ?';
      case 'current_page':
        return 'Tu en es à quelle page ?';
      case 'confirm':
        return 'Confirmer';
      default:
        return 'Configuration';
    }
  };

  return (
    <div 
      className="fixed inset-0 z-[250] bg-black/60 flex items-center justify-center p-4 font-sans"
      data-modal-overlay
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
        className="bg-white rounded-2xl max-w-md w-full shadow-xl"
      >
        <div className="p-6">
          <div className="flex items-start gap-4 mb-6">
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
              <BookOpen className="w-6 h-6 text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-bold text-text-main-light mb-1">
                {getStepTitle()}
              </h3>
              <p className="text-sm text-text-sub-light line-clamp-2">
                {bookTitle}
              </p>
            </div>
            <button
              onClick={onCancel}
              className="text-text-sub-light/60 hover:text-text-sub-light transition-colors flex-shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {step === 'total_pages' && renderTotalPagesStep()}
          {step === 'current_page' && renderCurrentPageStep()}
          {step === 'confirm' && renderConfirmStep()}
        </div>
      </div>
    </div>
  );
}

