import { useState } from 'react';
import { X, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface CreateClubModalProps {
  onClose: () => void;
  onCreated: () => void;
}

const CATEGORIES = [
  'Fiction',
  'Non-Fiction',
  'Science-Fiction',
  'Fantasy',
  'Mystère',
  'Romance',
  'Thriller',
  'Biographie',
  'Développement personnel',
  'Histoire',
  'Poésie',
  'Autre',
];

export function CreateClubModal({ onClose, onCreated }: CreateClubModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const { user } = useAuth();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!name.trim()) {
      setError('Le nom du club est requis');
      return;
    }

    setCreating(true);
    setError('');

    const { error: createError } = await supabase.from('clubs').insert({
      name: name.trim(),
      description: description.trim() || null,
      category: category || null,
      is_private: isPrivate,
      creator_id: user.id,
    });

    if (createError) {
      setError('Échec de la création du club');
      setCreating(false);
      return;
    }

    setCreating(false);
    onCreated();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-stone-200 px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-lime-100 rounded-full flex items-center justify-center">
              <Users className="w-5 h-5 text-lime-800" />
            </div>
            <h2 className="text-xl font-bold">Créer un club</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-stone-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleCreate} className="p-6 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-stone-900 mb-2">
              Nom du club <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex., Club de lecture Fantasy"
              className="w-full px-4 py-3 border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-lime-400 focus:border-transparent"
              maxLength={100}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-stone-900 mb-2">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="De quoi parle votre club ?"
              className="w-full px-4 py-3 border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-lime-400 focus:border-transparent resize-none"
              rows={4}
              maxLength={500}
            />
            <p className="text-xs text-stone-500 mt-1">{description.length}/500 caractères</p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-stone-900 mb-2">
              Catégorie
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-4 py-3 border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-lime-400 focus:border-transparent bg-white"
            >
              <option value="">Sélectionnez une catégorie</option>
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div className="bg-stone-50 rounded-xl p-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isPrivate}
                onChange={(e) => setIsPrivate(e.target.checked)}
                className="mt-1 w-4 h-4 rounded border-stone-300 text-stone-900 focus:ring-lime-400"
              />
              <div>
                <p className="font-semibold text-stone-900 text-sm mb-1">Rendre ce club privé</p>
                <p className="text-xs text-stone-600">
                  Les clubs privés ne sont visibles que par les membres. Les clubs publics peuvent être découverts et rejoints par n'importe qui.
                </p>
              </div>
            </label>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 border border-stone-300 text-stone-900 rounded-xl hover:bg-stone-50 transition-colors font-medium"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={creating || !name.trim()}
              className="flex-1 px-4 py-3 bg-stone-900 text-white rounded-xl hover:bg-stone-800 transition-colors font-medium disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {creating ? 'Création...' : 'Créer le club'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
