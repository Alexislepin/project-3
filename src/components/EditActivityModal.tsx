import { useState, useRef } from 'react';
import { X, Globe, Users, Lock, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useScrollLock } from '../hooks/useScrollLock';
import { Toast } from './Toast';
import { uploadFileToBucket } from '../lib/storageUpload';

interface EditActivityModalProps {
  activityId: string;
  initialPages?: number | null;
  initialDuration?: number | null;
  initialNotes?: string | null;
  initialPhotos?: string[] | null;
  initialVisibility?: 'public' | 'followers' | 'private';
  onClose: () => void;
  onSaved: () => void;
}

export function EditActivityModal({
  activityId,
  initialPages,
  initialDuration,
  initialNotes,
  initialPhotos,
  initialVisibility = 'public',
  onClose,
  onSaved,
}: EditActivityModalProps) {
  const { user } = useAuth();
  const [pages, setPages] = useState(initialPages?.toString() || '');
  const [duration, setDuration] = useState(initialDuration?.toString() || '');
  const [notes, setNotes] = useState(initialNotes || '');
  const [visibility, setVisibility] = useState<'public' | 'followers' | 'private'>(initialVisibility);
  const [existingPhotos, setExistingPhotos] = useState<string[]>(() => initialPhotos || []);
  const [newPhotos, setNewPhotos] = useState<{ file: File; preview: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);

  useScrollLock(true);

  const resolvePhotoUrl = (path: string) => {
    if (!path) return '';
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    const { data } = supabase.storage.from('activity-photos').getPublicUrl(path);
    return data?.publicUrl || path;
  };

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

      // Upload new photos if any
      let uploadedPhotoPaths: string[] = [];
      if (newPhotos.length > 0) {
        setUploadingPhotos(true);
        const uploads = await Promise.all(
          newPhotos.map(async (photo, idx) => {
            const path = `${user.id}/${activityId}/${Date.now()}_${idx}.jpg`;
            const { objectPath } = await uploadFileToBucket({
              bucket: 'activity-photos',
              path,
              file: photo.file,
              contentType: photo.file.type || 'image/jpeg',
              upsert: true,
            });
            return objectPath;
          })
        );
        uploadedPhotoPaths = uploads.filter(Boolean);
        setUploadingPhotos(false);
      }

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
      updateData.visibility = visibility;
      const combinedPhotos = [...existingPhotos.filter(Boolean), ...uploadedPhotoPaths];
      updateData.photos = combinedPhotos.length > 0 ? combinedPhotos : null;

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
      setUploadingPhotos(false);
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

            {/* Visibilité */}
            <div>
              <p className="text-sm font-semibold text-text-main-light mb-2">Visibilité</p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: 'public', label: 'Public', icon: Globe },
                  { value: 'followers', label: 'Abonnés', icon: Users },
                  { value: 'private', label: 'Privé', icon: Lock },
                ].map((opt) => {
                  const Icon = opt.icon;
                  const active = visibility === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setVisibility(opt.value as typeof visibility)}
                      className={`flex flex-col items-center gap-1 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                        active ? 'border-primary bg-primary/10 text-text-main-light' : 'border-border bg-white text-text-sub-light'
                      }`}
                    >
                      <Icon className={`w-4 h-4 ${active ? 'text-primary' : 'text-text-sub-light'}`} />
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

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

            {/* Photos */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-text-main-light">Photos</p>
                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      if (!files.length) return;
                      const mapped = files.map((file) => ({
                        file,
                        preview: URL.createObjectURL(file),
                      }));
                      setNewPhotos((prev) => [...prev, ...mapped]);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-2 rounded-lg border border-border text-sm font-semibold text-text-main-light hover:bg-surface-2 transition-colors disabled:opacity-50"
                    disabled={uploadingPhotos || saving}
                  >
                    Ajouter
                  </button>
                </div>
              </div>

              {(existingPhotos.length > 0 || newPhotos.length > 0) ? (
                <div className="grid grid-cols-3 gap-2">
                  {existingPhotos.map((url, idx) => (
                    <div key={`existing-${idx}`} className="relative group rounded-lg overflow-hidden border border-border">
                      <img src={resolvePhotoUrl(url)} alt="" className="w-full h-24 object-cover" />
                      <button
                        type="button"
                        onClick={() => setExistingPhotos((prev) => prev.filter((_, i) => i !== idx))}
                        className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition"
                        aria-label="Supprimer la photo"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  {newPhotos.map((photo, idx) => (
                    <div key={`new-${idx}`} className="relative group rounded-lg overflow-hidden border border-border">
                      <img src={photo.preview} alt="" className="w-full h-24 object-cover" />
                      <button
                        type="button"
                        onClick={() => setNewPhotos((prev) => prev.filter((_, i) => i !== idx))}
                        className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition"
                        aria-label="Supprimer la photo"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-text-sub-light">Aucune photo</div>
              )}
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

