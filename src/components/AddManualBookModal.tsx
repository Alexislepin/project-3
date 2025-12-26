import { useState } from 'react';
import { X, Book } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { ensureBookInDB } from '../lib/booksUpsert';

interface AddManualBookModalProps {
  onClose: () => void;
  onAdded: () => void;
}

export function AddManualBookModal({ onClose, onAdded }: AddManualBookModalProps) {
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [isbn, setIsbn] = useState('');
  const [totalPages, setTotalPages] = useState('');
  const [description, setDescription] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      setError('Vous devez être connecté pour ajouter un livre');
      return;
    }

    if (!title.trim() || !author.trim()) {
      setError("Le titre et l'auteur sont obligatoires");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const isbnValue = isbn.trim() || null;

      // Build book object for ensureBookInDB
      const bookData: any = {
        title: title.trim(),
        author: author.trim(),
        total_pages: totalPages ? (parseInt(totalPages, 10) > 0 ? parseInt(totalPages, 10) : null) : null,
        isbn: isbnValue,
        description: description.trim() || null,
        source: 'manual',
      };

      // Ensure book exists in DB
      let bookId: string;
      try {
        bookId = await ensureBookInDB(supabase, bookData);
      } catch (bookError: any) {
        console.error('Error ensuring manual book in DB:', bookError);
        setError("Impossible d'ajouter le livre");
        setSaving(false);
        return;
      }

      // Upsert into user_books
      const { error: userBookError } = await supabase
        .from('user_books')
        .upsert({
          user_id: user.id,
          book_id: bookId,
          status: 'want_to_read',
          current_page: 0,
          progress_pct: 0,
        }, {
          onConflict: 'user_id,book_id',
        });

      if (userBookError) {
        console.error('Error inserting manual user_book:', userBookError);
        setError("Impossible d'ajouter le livre à votre bibliothèque");
        setSaving(false);
        return;
      }

      onAdded();
      onClose();
    } catch (err) {
      console.error('Unexpected error in AddManualBookModal:', err);
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
              <Book className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-text-main-light">Ajouter un livre manuellement</h2>
              <p className="text-sm text-text-sub-light">
                Remplissez les informations de votre livre personnalisé
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
              Titre <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Mon livre personnalisé"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-text-main-light mb-2">
              Auteur <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="Nom de l'auteur"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-text-main-light mb-2">
                ISBN (optionnel)
              </label>
              <input
                type="text"
                value={isbn}
                onChange={(e) => setIsbn(e.target.value)}
                placeholder="Ex: 9782070360024"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-text-main-light mb-2">
                Nombre de pages
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
              URL de couverture (optionnel)
            </label>
            <input
              type="url"
              value={coverUrl}
              onChange={(e) => setCoverUrl(e.target.value)}
              placeholder="https://exemple.com/mon-livre.jpg"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-text-main-light mb-2">
              Description (optionnel)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Résumé du livre..."
              rows={4}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
            />
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
              {saving ? 'Ajout en cours...' : 'Ajouter'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


