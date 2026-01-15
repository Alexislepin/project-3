import { Trash2, ArrowRight, X, Edit } from 'lucide-react';
import { ModalSheet } from './ModalSheet';

interface ManageBookModalProps {
  onClose: () => void;
  onDelete: () => void;
  onChangeStatus: (status: 'reading' | 'completed' | 'want_to_read') => void;
  onEdit?: () => void; // Nouveau: ouvre EditBookModal
  bookTitle: string;
  currentStatus: 'reading' | 'completed' | 'want_to_read';
}

export function ManageBookModal({
  onClose,
  onDelete,
  onChangeStatus,
  onEdit,
  bookTitle,
  currentStatus
}: ManageBookModalProps) {
  const statusLabels = {
    reading: 'En cours',
    completed: 'Terminé',
    want_to_read: 'À lire'
  };

  const getStatusLabel = (status: typeof currentStatus) => {
    const labels = {
      reading: 'En cours de lecture',
      completed: 'Déjà lu',
      want_to_read: 'À lire'
    };
    return labels[status];
  };

  const getStatusColor = (status: typeof currentStatus) => {
    const colors = {
      reading: 'blue',
      completed: 'green',
      want_to_read: 'gray'
    };
    return colors[status];
  };

  const header = (
    <div className="px-6 pt-4 pb-3">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-gray-900 mb-1">
            Gérer le livre
          </h3>
          <p className="text-sm text-gray-600">
            {bookTitle}
          </p>
          <span className={`inline-block mt-2 px-3 py-1 rounded-full text-xs font-medium bg-${getStatusColor(currentStatus)}-100 text-${getStatusColor(currentStatus)}-700`}>
            {statusLabels[currentStatus]}
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );

  return (
    <ModalSheet onClose={onClose} header={header} maxWidth="min(448px, 92vw)">
      <div className="p-6">
        <div className="space-y-3">
            {/* Bouton Modifier */}
            {onEdit && (
              <button
                onClick={() => {
                  onEdit();
                  onClose();
                }}
                className="w-full p-4 bg-blue-50 hover:bg-blue-100 text-left rounded-xl transition-colors flex items-center justify-between"
              >
                <div>
                  <div className="font-semibold text-blue-900">Modifier</div>
                  <div className="text-sm text-blue-700">Modifier les détails du livre</div>
                </div>
                <Edit className="w-5 h-5 text-blue-600" />
              </button>
            )}

            {/* Section "Déplacer vers" avec 3 boutons visibles */}
            <div className="border-t border-gray-200 pt-4 mt-4">
              <div className="text-sm font-semibold text-gray-900 mb-3">
                Déplacer vers :
              </div>
              <div className="space-y-2">
                {(['reading', 'completed', 'want_to_read'] as const).map((status) => {
                  const isCurrent = status === currentStatus;
                  const color = getStatusColor(status);
                  const label = getStatusLabel(status);
                  
                  return (
                    <button
                      key={status}
                      onClick={() => {
                        if (!isCurrent) {
                          onChangeStatus(status);
                        }
                      }}
                      disabled={isCurrent}
                      className={`w-full p-3.5 rounded-xl transition-colors flex items-center justify-between ${
                        isCurrent
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          : `bg-${color}-50 hover:bg-${color}-100 text-left`
                      }`}
                    >
                      <div>
                        <div className={`font-semibold ${isCurrent ? 'text-gray-400' : `text-${color}-900`}`}>
                          {label}
                        </div>
                      </div>
                      {!isCurrent && <ArrowRight className={`w-5 h-5 text-${color}-600`} />}
                      {isCurrent && <span className="text-xs text-gray-400">Actuel</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Section "Supprimer" */}
            <div className="border-t border-gray-200 pt-4 mt-4">
              <button
                onClick={onDelete}
                className="w-full p-4 bg-red-50 hover:bg-red-100 text-left rounded-xl transition-colors flex items-center justify-between"
              >
                <div>
                  <div className="font-semibold text-red-900">Supprimer</div>
                  <div className="text-sm text-red-700">Retirer de ma bibliothèque</div>
                </div>
                <Trash2 className="w-5 h-5 text-red-600" />
              </button>
            </div>
        </div>

        <button
          onClick={onClose}
          className="w-full mt-4 py-3 text-gray-600 hover:text-gray-900 font-medium transition-colors"
        >
          Annuler
        </button>
      </div>
    </ModalSheet>
  );
}
