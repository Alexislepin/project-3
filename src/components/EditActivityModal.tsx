import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useScrollLock } from '../hooks/useScrollLock';
import { Toast } from './Toast';

interface EditActivityModalProps {
  activityId: string;
  initialPages?: number | null;
  initialDuration?: number | null;
  initialNotes?: string | null;
  onClose: () => void;
  onSaved: () => void;
}

export function EditActivityModal({
  activityId,
  initialPages,
  initialDuration,
  initialNotes,
  onClose,
  onSaved,
}: EditActivityModalProps) {
  const { user } = useAuth();
  const [pages, setPages] = useState(initialPages?.toString() || '');
  const [duration, setDuration] = useState(initialDuration?.toString() || '');
  const [notes, setNotes] = useState(initialNotes || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useScrollLock(true);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setError(null);
    setSaving(true);

    try {
      const pagesValue = pages.trim() ? parseInt(pages.trim(), 10) : null;
      const durationValue = duration.trim() ? parseInt(duration.trim(), 10) : null;

      if (pagesValue !== null && (isNaN(pagesValue) || pagesValue < 0)) {
        setError('Le nombre de pages doit être un nombre positif');
        setSaving(false);
        return;
      }

      if (durationValue !== null && (isNaN(durationValue) || durationValue < 0)) {
        setError('La durée doit être un nombre positif');
        setSaving(false);
        return;
      }

      // Calculate pages delta for stats update
      const oldPages = initialPages || 0;
      const newPages = pagesValue || 0;
      const pagesDelta = newPages - oldPages;

      // Update activity
      const updateData: any = {};
      if (pagesValue !== null) {
        updateData.pages_read = pagesValue;
      }
      if (durationValue !== null) {
        updateData.duration_minutes = durationValue;
      }
      if (notes !== initialNotes) {
        updateData.notes = notes.trim() || null;
      }

      const { error: updateError } = await supabase
        .from('activities')
        .update(updateData)
        .eq('id', activityId)
        .eq('user_id', user.id); // RLS: only owner can update

      if (updateError) {
        throw updateError;
      }

      // Update user_profiles.total_pages_read if pages changed
      if (pagesDelta !== 0) {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('total_pages_read')
          .eq('id', user.id)
          .maybeSingle();

        if (profile) {
          await supabase
            .from('user_profiles')
            .update({
              total_pages_read: Math.max(0, (profile.total_pages_read || 0) + pagesDelta),
            })
            .eq('id', user.id);
        }
      }

      setToast({ message: 'Activité modifiée avec succès', type: 'success' });
      setTimeout(() => {
        onSaved();
        onClose();
      }, 500);
    } catch (err: any) {
      console.error('[EditActivityModal] Error:', err);
      setError(err.message || 'Une erreur est survenue');
      setToast({ message: err.message || 'Une erreur est survenue', type: 'error' });
    } finally {
      setSaving(false);
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
          className="bg-white rounded-2xl max-w-md w-full shadow-xl max-h-[85vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="sticky top-0 bg-white border-b border-gray-200 p-5 flex items-center justify-between rounded-t-2xl">
            <h2 className="text-xl font-bold text-text-main-light">Modifier l'activité</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-text-main-light mb-2">
                Pages lues
              </label>
              <input
                type="number"
                min={0}
                value={pages}
                onChange={(e) => setPages(e.target.value)}
                placeholder="0"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-text-main-light mb-2">
                Durée (minutes)
              </label>
              <input
                type="number"
                min={0}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="0"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-text-main-light mb-2">
                Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ajouter des notes..."
                rows={4}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
              />
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 px-4 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-colors"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 py-3 px-4 bg-primary text-black rounded-xl font-semibold hover:brightness-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          </form>
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

