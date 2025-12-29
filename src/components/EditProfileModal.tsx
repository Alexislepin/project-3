import { useState, useRef } from 'react';
import { X, Check, Camera, Image as ImageIcon } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Camera as CapacitorCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { uploadImageToSupabase, generateAvatarPath } from '../lib/storageUpload';
import { debugError } from '../utils/logger';

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
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [error, setError] = useState('');
  const { user, updateProfile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleAddInterest = () => {
    if (newInterest.trim() && !interests.includes(newInterest.trim())) {
      setInterests([...interests, newInterest.trim()]);
      setNewInterest('');
    }
  };

  const handleRemoveInterest = (interest: string) => {
    setInterests(interests.filter((i) => i !== interest));
  };

  const handleCameraSource = async (cameraSource: CameraSource) => {
    try {
      setError('');
      
      if (!Capacitor.isNativePlatform()) {
        fileInputRef.current?.click();
        return;
      }

      // Check permissions first
      try {
        const { Camera } = await import('@capacitor/camera');
        const permissions = await Camera.checkPermissions();
        
        if (cameraSource === CameraSource.Camera) {
          if (permissions.camera !== 'granted') {
            const requestResult = await Camera.requestPermissions({ permissions: ['camera'] });
            if (requestResult.camera !== 'granted') {
              setError('Permission caméra refusée. Ouvrez les Réglages pour autoriser l\'accès.');
              return;
            }
          }
        } else if (cameraSource === CameraSource.Photos) {
          if (permissions.photos !== 'granted') {
            const requestResult = await Camera.requestPermissions({ permissions: ['photos'] });
            if (requestResult.photos !== 'granted') {
              setError('Permission galerie refusée. Ouvrez les Réglages pour autoriser l\'accès.');
              return;
            }
          }
        }
      } catch (permError: any) {
        debugError('[EditProfileModal] Permission check error:', permError);
        // Continue anyway, might work on some platforms
      }

      // Handle simulator fallback for camera
      if (cameraSource === CameraSource.Camera && Capacitor.getPlatform() === 'ios') {
        try {
          const image = await CapacitorCamera.getPhoto({
            quality: 80,
            allowEditing: true,
            resultType: CameraResultType.Uri,
            source: CameraSource.Camera,
          });

          if (!image.webPath) {
            return;
          }

          const response = await fetch(image.webPath);
          const blob = await response.blob();
          const file = new File([blob], 'avatar.jpg', { type: 'image/jpeg' });

          setAvatarFile(file);
          setAvatarPreview(image.webPath);
        } catch (cameraError: any) {
          // If camera fails (e.g., simulator), fallback to gallery
          if (cameraError.message?.includes('not available') || cameraError.message?.includes('simulator')) {
            setError('Caméra indisponible. Utilisation de la galerie...');
            // Fallback to gallery
            try {
              const image = await CapacitorCamera.getPhoto({
                quality: 80,
                allowEditing: true,
                resultType: CameraResultType.Uri,
                source: CameraSource.Photos,
              });

              if (!image.webPath) {
                return;
              }

              const response = await fetch(image.webPath);
              const blob = await response.blob();
              const file = new File([blob], 'avatar.jpg', { type: 'image/jpeg' });

              setAvatarFile(file);
              setAvatarPreview(image.webPath);
              setError(''); // Clear error on success
            } catch (galleryError: any) {
              if (galleryError.message?.includes('cancel') || galleryError.message?.includes('User cancelled')) {
                return;
              }
              debugError('[EditProfileModal] Gallery fallback error:', galleryError);
              setError('Erreur lors de l\'accès à la galerie');
            }
          } else {
            throw cameraError;
          }
        }
      } else {
        // Normal flow for gallery or non-iOS camera
        const image = await CapacitorCamera.getPhoto({
          quality: 80,
          allowEditing: true,
          resultType: CameraResultType.Uri,
          source: cameraSource,
        });

        if (!image.webPath) {
          return;
        }

        const response = await fetch(image.webPath);
        const blob = await response.blob();
        const file = new File([blob], 'avatar.jpg', { type: 'image/jpeg' });

        setAvatarFile(file);
        setAvatarPreview(image.webPath);
      }
    } catch (error: any) {
      if (error.message?.includes('cancel') || error.message?.includes('User cancelled')) {
        return;
      }
      if (error.message?.includes('Permission') || error.message?.includes('permission')) {
        setError('Permission refusée. Ouvrez les Réglages pour autoriser l\'accès à la caméra ou à la galerie.');
      } else {
        debugError('[EditProfileModal] Camera error:', error);
        setError('Erreur lors de la prise de photo. Veuillez réessayer.');
      }
    }
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

    setAvatarFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      setAvatarUrl(base64String);
      setAvatarPreview(base64String);
      setError('');
    };
    reader.readAsDataURL(file);
  };

  const uploadAvatar = async (): Promise<string | null> => {
    if (!avatarFile || !user) return null;

    setUploadingAvatar(true);
    try {
      const path = generateAvatarPath(user.id);
      await uploadImageToSupabase(supabase, avatarFile, {
        bucket: 'avatars',
        path,
        compress: true,
        maxWidth: 512,
        maxHeight: 512,
        quality: 0.8,
      });

      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      const avatarUrl = data?.publicUrl ? `${data.publicUrl}?t=${Date.now()}` : null;
      setUploadingAvatar(false);
      return avatarUrl;
    } catch (err: any) {
      debugError('[EditProfileModal] Avatar upload error:', err);
      setUploadingAvatar(false);
      setError('Erreur lors de l\'upload de l\'avatar');
      return null;
    }
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

    // Upload avatar if a new file was selected
    let finalAvatarUrl = avatarUrl;
    if (avatarFile) {
      const uploadedUrl = await uploadAvatar();
      if (uploadedUrl) {
        finalAvatarUrl = uploadedUrl;
      } else {
        setSaving(false);
        return; // Error already set in uploadAvatar
      }
    }

    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({
        display_name: displayName.trim(),
        username: username.trim().toLowerCase(),
        bio: bio.trim() || null,
        interests: interests.length > 0 ? interests : null,
        avatar_url: finalAvatarUrl || null,
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

    // Also update via context if available
    if (updateProfile && finalAvatarUrl) {
      await updateProfile({ avatar_url: finalAvatarUrl });
    }

    setSaving(false);
    onSave();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex-shrink-0 bg-white border-b border-stone-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold">Modifier le profil</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-stone-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="p-6 space-y-5" style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}>
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
              </div>
              <div className="flex-1">
                <p className="text-sm text-stone-600 mb-2">
                  Choisissez une photo pour votre profil
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleCameraSource(CameraSource.Camera)}
                    disabled={uploadingAvatar || saving}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 text-sm"
                  >
                    <Camera className="w-4 h-4" />
                    <span>Caméra</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCameraSource(CameraSource.Photos)}
                    disabled={uploadingAvatar || saving}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 text-sm"
                  >
                    <ImageIcon className="w-4 h-4" />
                    <span>Galerie</span>
                  </button>
                </div>
                <input
                  id="avatar-upload"
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
                <p className="text-xs text-stone-500 mt-2">
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
              className="w-full px-4 py-3 border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-lime-400 focus:border-transparent bg-white text-stone-900"
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
                className="w-full pl-8 pr-4 py-3 border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-lime-400 focus:border-transparent bg-white text-stone-900"
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
              className="w-full px-4 py-3 border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-lime-400 focus:border-transparent resize-none bg-white text-stone-900"
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
                className="flex-1 px-4 py-2 border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-lime-400 focus:border-transparent bg-white text-stone-900"
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
        </div>

        <div className="flex-shrink-0 border-t border-stone-200 px-6 py-4 flex gap-3" style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom) + 24px)' }}>
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
