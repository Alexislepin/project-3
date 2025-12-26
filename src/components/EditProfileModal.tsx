import { useState } from 'react';
import { X, Check, Camera } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface EditProfileModalProps {
  profile: any;
  onClose: () => void;
  onSave: () => void;
}

export function EditProfileModal({ profile, onClose, onSave }: EditProfileModalProps) {
  const [displayName, setDisplayName] = useState(profile.display_name || '');
  const [username, setUsername] = useState(profile.username || '');
  const [bio, setBio] = useState(profile.bio || '');
  const [interests, setInterests] = useState<string[]>(profile.interests || []);
  const [newInterest, setNewInterest] = useState('');
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url || '');
  const [avatarPreview, setAvatarPreview] = useState(profile.avatar_url || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const { user } = useAuth();

  const handleAddInterest = () => {
    if (newInterest.trim() && !interests.includes(newInterest.trim())) {
      setInterests([...interests, newInterest.trim()]);
      setNewInterest('');
    }
  };

  const handleRemoveInterest = (interest: string) => {
    setInterests(interests.filter((i) => i !== interest));
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setError('L\'image ne doit pas dépasser 5 Mo');
      return;
    }

    if (!file.type.startsWith('image/')) {
      setError('Le fichier doit être une image');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      setAvatarUrl(base64String);
      setAvatarPreview(base64String);
      setError('');
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!user) return;

    if (!displayName.trim()) {
      setError('Le nom affiché est requis');
      return;
    }

    if (!username.trim()) {
      setError('Le nom d\'utilisateur est requis');
      return;
    }

    setSaving(true);
    setError('');

    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({
        display_name: displayName.trim(),
        username: username.trim().toLowerCase(),
        bio: bio.trim() || null,
        interests: interests.length > 0 ? interests : null,
        avatar_url: avatarUrl || null,
      })
      .eq('id', user.id);

    if (updateError) {
      if (updateError.code === '23505') {
        setError('Ce nom d\'utilisateur est déjà pris');
      } else {
        setError('Échec de la mise à jour du profil');
      }
      setSaving(false);
      return;
    }

    setSaving(false);
    onSave();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-stone-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold">Modifier le profil</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-stone-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-stone-900 mb-3">
              Photo de profil
            </label>
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="w-24 h-24 rounded-full bg-stone-200 flex items-center justify-center overflow-hidden">
                  {avatarPreview ? (
                    <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-3xl font-bold text-stone-600">
                      {displayName.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <label
                  htmlFor="avatar-upload"
                  className="absolute -bottom-1 -right-1 w-8 h-8 bg-stone-900 rounded-full flex items-center justify-center cursor-pointer hover:bg-stone-800 transition-colors"
                >
                  <Camera className="w-4 h-4 text-white" />
                  <input
                    id="avatar-upload"
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </label>
              </div>
              <div className="flex-1">
                <p className="text-sm text-stone-600 mb-1">
                  Choisissez une photo pour votre profil
                </p>
                <p className="text-xs text-stone-500">
                  JPG, PNG ou GIF. Maximum 5 Mo.
                </p>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-stone-900 mb-2">
              Nom affiché
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Votre nom"
              className="w-full px-4 py-3 border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-lime-400 focus:border-transparent"
              maxLength={50}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-stone-900 mb-2">
              Nom d'utilisateur
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-500">@</span>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value.replace(/[^a-z0-9_]/g, ''))}
                placeholder="nomutilisateur"
                className="w-full pl-8 pr-4 py-3 border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-lime-400 focus:border-transparent"
                maxLength={30}
              />
            </div>
            <p className="text-xs text-stone-500 mt-1">Seulement des lettres minuscules, chiffres et underscores</p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-stone-900 mb-2">
              Bio
            </label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Parlez-nous de vous..."
              className="w-full px-4 py-3 border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-lime-400 focus:border-transparent resize-none"
              rows={4}
              maxLength={200}
            />
            <p className="text-xs text-stone-500 mt-1">{bio.length}/200 caractères</p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-stone-900 mb-2">
              Centres d'intérêt
            </label>
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={newInterest}
                onChange={(e) => setNewInterest(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddInterest();
                  }
                }}
                placeholder="Ajouter un centre d'intérêt"
                className="flex-1 px-4 py-2 border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-lime-400 focus:border-transparent"
                maxLength={30}
              />
              <button
                onClick={handleAddInterest}
                type="button"
                className="px-4 py-2 bg-stone-900 text-white rounded-xl hover:bg-stone-800 transition-colors"
              >
                Ajouter
              </button>
            </div>

            {interests.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {interests.map((interest) => (
                  <span
                    key={interest}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-stone-100 text-stone-900 rounded-lg text-sm font-medium"
                  >
                    {interest}
                    <button
                      onClick={() => handleRemoveInterest(interest)}
                      className="hover:text-red-600 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-stone-200 p-6 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 border border-stone-300 text-stone-900 rounded-xl hover:bg-stone-50 transition-colors font-medium"
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !displayName.trim() || !username.trim()}
            className="flex-1 px-4 py-3 bg-stone-900 text-white rounded-xl hover:bg-stone-800 transition-colors font-medium disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {saving ? (
              'Enregistrement...'
            ) : (
              <>
                <Check className="w-5 h-5" />
                Enregistrer les modifications
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
