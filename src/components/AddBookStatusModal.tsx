import { useState } from 'react';
import { Book } from 'lucide-react';
import { fatalError } from '../utils/logger';
import { useScrollLock } from '../hooks/useScrollLock';

interface AddBookStatusModalProps {
  onClose: () => void;
  onSelect: (status: 'reading' | 'completed' | 'want_to_read') => Promise<void>;
  bookTitle: string;
}

export function AddBookStatusModal({ onClose, onSelect, bookTitle }: AddBookStatusModalProps) {
  const [isAdding, setIsAdding] = useState(false);

  useScrollLock(true);

  const handleSelect = async (status: 'reading' | 'completed' | 'want_to_read') => {
    // Prevent duplicate calls
    if (isAdding) {
      return;
    }
    
    setIsAdding(true);
    try {
      await onSelect(status);
      // Modal will be closed by parent on success
      // Reset state in case modal stays open (error case)
      setIsAdding(false);
    } catch (error) {
      fatalError('Error adding book:', error);
      setIsAdding(false);
      // Don't close modal on error - let user retry
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-[110] p-4"
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
              <Book className="w-6 h-6 text-blue-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900 mb-1">
                Ajouter à ma bibliothèque
              </h3>
              <p className="text-sm text-gray-600">
                {bookTitle}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => handleSelect('reading')}
              disabled={isAdding}
              className="w-full p-4 bg-blue-50 hover:bg-blue-100 text-left rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="font-semibold text-blue-900">
                {isAdding ? 'Ajout en cours...' : 'En cours de lecture'}
              </div>
              <div className="text-sm text-blue-700">Je lis ce livre actuellement</div>
            </button>

            <button
              onClick={() => handleSelect('completed')}
              disabled={isAdding}
              className="w-full p-4 bg-green-50 hover:bg-green-100 text-left rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="font-semibold text-green-900">
                {isAdding ? 'Ajout en cours...' : 'Déjà lu'}
              </div>
              <div className="text-sm text-green-700">J'ai terminé ce livre</div>
            </button>

            <button
              onClick={() => handleSelect('want_to_read')}
              disabled={isAdding}
              className="w-full p-4 bg-gray-50 hover:bg-gray-100 text-left rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="font-semibold text-gray-900">
                {isAdding ? 'Ajout en cours...' : 'À lire'}
              </div>
              <div className="text-sm text-gray-700">Je veux lire ce livre plus tard</div>
            </button>
          </div>

          <button
            onClick={onClose}
            disabled={isAdding}
            className="w-full mt-4 py-3 text-gray-600 hover:text-gray-900 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}
