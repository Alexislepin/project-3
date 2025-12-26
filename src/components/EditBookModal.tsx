import { useState } from 'react';
import { X, Edit3 } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface EditBookModalProps {
  userBookId: string;
  initialTitle: string;
  initialAuthor: string;
  initialTotalPages?: number | null;
  initialDescription?: string | null;
  initialCoverUrl?: string | null;
  onClose: () => void;
  onSaved: () => void;
}

export function EditBookModal({
  userBookId,
  initialTitle,
  initialAuthor,
  initialTotalPages,
  initialDescription,
  initialCoverUrl,
  onClose,
  onSaved,
}: EditBookModalProps) {
  const [title, setTitle] = useState(initialTitle ?? '');
  const [author, setAuthor] = useState(initialAuthor ?? '');
  const [totalPages, setTotalPages] = useState(
    initialTotalPages && initialTotalPages > 0 ? String(initialTotalPages) : '',
  );
  const [description, setDescription] = useState(initialDescription ?? '');
  const [coverUrl, setCoverUrl] = useState(initialCoverUrl ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim() || !author.trim()) {
      setError("Le titre et l'auteur sont obligatoires");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const { error: updateError } = await supabase
        .from('user_books')
        .update({
          custom_title: title.trim(),
          custom_author: author.trim(),
          custom_total_pages: totalPages ? parseInt(totalPages, 10) || null : null,
          custom_description: description.trim() || null,
          custom_cover_url: coverUrl.trim() || null,
        })
        .eq('id', userBookId);

      if (updateError) {
        console.error('Error updating user_books custom fields:', updateError);
        setError("Une erreur est survenue lors de l'enregistrement");
        setSaving(false);
        return;
      }

      onSaved();
      onClose();
    } catch (err) {
      console.error('Unexpected error in EditBookModal:', err);
      setError("Une erreur inattendue est survenue");
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 p-4 flex items-center justify-between rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Edit3 className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-text-main-light">Modifier le livre</h2>
              <p className="text-sm text-text-sub-light">
                Ces modifications sont propres à votre bibliothèque
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-text-main-light mb-2">
              Titre personnalisé
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Mon édition préférée"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-text-main-light mb-2">
              Auteur personnalisé
            </label>
            <input
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="Nom de l'auteur"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-text-main-light mb-2">
                Nombre de pages personnalisé
              </label>
              <input
                type="number"
                min={1}
                value={totalPages}
                onChange={(e) => setTotalPages(e.target.value)}
                placeholder="Ex: 320"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-text-main-light mb-2">
              Description personnalisée
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Votre résumé, vos notes..."
              rows={4}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-text-main-light mb-2">
              URL de couverture personnalisée
            </label>
            <input
              type="url"
              value={coverUrl}
              onChange={(e) => setCoverUrl(e.target.value)}
              placeholder="https://exemple.com/mon-livre.jpg"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
            <p className="mt-1 text-xs text-text-sub-light">
              Pour l&apos;instant, seules les URLs d&apos;image sont supportées.
            </p>
          </div>

          {error && (
            <p className="text-sm text-red-600">
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 px-4 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-colors"
              disabled={saving}
            >
              Annuler
            </button>
            <button
              type="submit"
              className="flex-1 py-3 px-4 bg-primary text-black rounded-xl font-semibold hover:brightness-95 transition-all disabled:opacity-50"
              disabled={saving}
            >
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


