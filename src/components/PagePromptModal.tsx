import { useState } from 'react';
import { BookOpen, X } from 'lucide-react';

interface PagePromptModalProps {
  open: boolean;
  totalPages?: number | null;
  onCancel: () => void;
  onConfirm: (page: number) => void;
}

export function PagePromptModal({ open, totalPages, onCancel, onConfirm }: PagePromptModalProps) {
  const [currentPage, setCurrentPage] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleConfirm = () => {
    setError(null);

    // If empty, default to 0
    if (!currentPage.trim()) {
      onConfirm(0);
      return;
    }

    const pageNum = parseInt(currentPage.trim(), 10);

    // Validate: must be a number >= 0
    if (isNaN(pageNum) || pageNum < 0) {
      setError('Le nombre de pages doit être un nombre positif');
      return;
    }

    // If totalPages is known, validate it's not greater
    if (totalPages && totalPages > 0 && pageNum > totalPages) {
      setError(`Le nombre de pages ne peut pas dépasser ${totalPages}`);
      return;
    }

    onConfirm(pageNum);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setCurrentPage(value);
    setError(null); // Clear error on input change
  };

  return (
    <div className="fixed inset-0 z-[250] bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-xl font-sans">
        <div className="p-6">
          <div className="flex items-start gap-4 mb-6">
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
              <BookOpen className="w-6 h-6 text-blue-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-text-main-light mb-1">
                Tu en es à quelle page ?
              </h3>
              <p className="text-sm text-text-sub-light">
                Tu pourras modifier plus tard
              </p>
            </div>
            <button
              onClick={onCancel}
              className="text-text-sub-light/60 hover:text-text-sub-light transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-semibold text-text-main-light mb-2">
              Page actuelle
            </label>
            <input
              type="number"
              min={0}
              max={totalPages && totalPages > 0 ? totalPages : undefined}
              value={currentPage}
              onChange={handleInputChange}
              placeholder={totalPages && totalPages > 0 ? `0 à ${totalPages}` : '0'}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-lg font-sans text-text-main-light placeholder:text-text-sub-light/60"
              autoFocus
            />
            {totalPages && totalPages > 0 && (
              <p className="mt-2 text-xs text-text-sub-light/70">
                Ce livre a {totalPages} pages au total
              </p>
            )}
            {error && (
              <p className="mt-2 text-sm text-red-600 font-sans">
                {error}
              </p>
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
              onClick={handleConfirm}
              className="flex-1 py-3 px-4 bg-primary text-black rounded-xl font-semibold hover:brightness-95 transition-all font-sans"
            >
              Continuer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

