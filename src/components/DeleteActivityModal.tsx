import { useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useScrollLock } from '../hooks/useScrollLock';
import { Toast } from './Toast';

interface DeleteActivityModalProps {
  activityId: string;
  activityPages?: number | null;
  onClose: () => void;
  onDeleted: () => void;
}

export function DeleteActivityModal({
  activityId,
  activityPages,
  onClose,
  onDeleted,
}: DeleteActivityModalProps) {
  const { user } = useAuth();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useScrollLock(true);

  const handleDelete = async () => {
    if (!user) return;

    setError(null);
    setDeleting(true);

    try {
      // Get activity to get pages_read before deletion
      const { data: activity } = await supabase
        .from('activities')
        .select('pages_read')
        .eq('id', activityId)
        .eq('user_id', user.id)
        .maybeSingle();

      // Delete activity (RLS: only owner can delete)
      const { error: deleteError } = await supabase
        .from('activities')
        .delete()
        .eq('id', activityId)
        .eq('user_id', user.id);

      if (deleteError) {
        throw deleteError;
      }

      // Update user_profiles.total_pages_read if activity had pages
      if (activity?.pages_read && activity.pages_read > 0) {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('total_pages_read')
          .eq('id', user.id)
          .maybeSingle();

        if (profile) {
          await supabase
            .from('user_profiles')
            .update({
              total_pages_read: Math.max(0, (profile.total_pages_read || 0) - activity.pages_read),
            })
            .eq('id', user.id);
        }
      }

      setToast({ message: 'Activité supprimée avec succès', type: 'success' });
      setTimeout(() => {
        onDeleted();
        onClose();
      }, 500);
    } catch (err: any) {
      console.error('[DeleteActivityModal] Error:', err);
      setError(err.message || 'Une erreur est survenue');
      setToast({ message: err.message || 'Une erreur est survenue', type: 'error' });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 bg-black/60 z-[300] flex items-center justify-center p-4"
        data-modal-overlay
        onClick={onClose}
        onTouchMove={(e) => {
          const target = e.target as HTMLElement;
          if (!target.closest('[data-modal-content]')) {
            e.preventDefault();
          }
        }}
      >
        <div
          data-modal-content
          className="bg-white rounded-2xl max-w-md w-full shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-bold text-text-main-light">Supprimer cette activité ?</h2>
                <p className="text-sm text-text-sub-light mt-1">
                  Cette action est irréversible.
                </p>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl mb-4">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                disabled={deleting}
                className="flex-1 py-3 px-4 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-3 px-4 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleting ? 'Suppression...' : 'Supprimer'}
              </button>
            </div>
          </div>
        </div>
      </div>

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

