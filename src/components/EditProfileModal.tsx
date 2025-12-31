import { useState, useEffect, useRef } from 'react';
import { X, Check, Image as ImageIcon } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Toast } from './Toast';
import { Capacitor } from '@capacitor/core';
import { pickImageBlob } from '../lib/pickImage';

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
  const [avatarPreview, setAvatarPreview] = useState(profile.avatar_url || '');
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const { user, updateProfile, refreshProfile } = useAuth();
  const ignoreBackdropRef = useRef(false);

  const handleAddInterest = () => {
    if (newInterest.trim() && !interests.includes(newInterest.trim())) {
      setInterests([...interests, newInterest.trim()]);
      setNewInterest('');
    }
  };

  const handleRemoveInterest = (interest: string) => {
    setInterests(interests.filter((i) => i !== interest));
  };

  const handleChangeAvatar = async (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    if (import.meta.env.DEV) {
      console.log('[EditProfileModal] avatar click');
    }
    
    if (!user?.id) {
      setToast({ message: 'Erreur: utilisateur non connecté', type: 'error' });
      return;
    }
    
    if (uploadingAvatar) {
      return;
    }
    
    setError('');
    setUploadingAvatar(true);

    // Prevent backdrop close during picker (iOS bug fix)
    ignoreBackdropRef.current = true;
    setTimeout(() => {
      ignoreBackdropRef.current = false;
    }, 800);
    
    try {
      if (import.meta.env.DEV) {
        console.log('[EditProfileModal] pick start');
      }
      
      const result = await pickImageBlob();
      
      if (!result) {
        if (import.meta.env.DEV) {
          console.log('[EditProfileModal] pick cancelled');
        }
        setUploadingAvatar(false);
        return;
      }

      const { blob, contentType, ext } = result;
      
      if (import.meta.env.DEV) {
        console.log('[EditProfileModal] pick success', {
          platform: Capacitor.getPlatform(),
          contentType,
          size: blob.size,
          ext,
        });
      }
      
      // Set preview immediately (local preview from blob)
      const previewUrl = URL.createObjectURL(blob);
      setAvatarPreview(previewUrl);
      
      // Upload to Supabase Storage with RLS-compatible path
      const filePath = `${user.id}/avatar_${Date.now()}.${ext}`;
      
      if (import.meta.env.DEV) {
        console.log('[EditProfileModal] upload start', {
          bucket: 'avatars',
          path: filePath,
          userId: user.id,
          contentType,
          blobSize: blob.size,
        });
      }
      
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, blob, {
          upsert: true,
          contentType,
        });
      
      if (uploadError) {
        console.error('[EditProfileModal] upload error', {
          bucket: 'avatars',
          path: filePath,
          error: uploadError,
          code: uploadError.statusCode,
          message: uploadError.message,
        });
        throw uploadError;
      }
      
      // Get public URL
      const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
      const publicUrl = publicUrlData?.publicUrl;
      
      if (!publicUrl) {
        throw new Error('Failed to get public URL');
      }
      
      if (import.meta.env.DEV) {
        console.log('[EditProfileModal] upload success', { publicUrl });
      }
      
      // Update user_profiles.avatar_url immediately
      const { error: updateError } = await supabase
        .from('user_profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', user.id);
      
      if (updateError) {
        console.error('[EditProfileModal] DB update error', {
          code: updateError.code,
          message: updateError.message,
        });
        throw updateError;
      }
      
      // Cleanup blob URL and update preview with public URL
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
      setAvatarPreview(publicUrl);
      
      // Refresh profile in context
      await refreshProfile(user.id);
      
      setToast({ message: 'Photo de profil mise à jour', type: 'success' });
      if (import.meta.env.DEV) {
        console.log('[EditProfileModal] avatar update complete');
      }
      
    } catch (err: any) {
      console.error('[EditProfileModal] upload error', err);
      
      // Cleanup blob URL if created
      if (avatarPreview && avatarPreview.startsWith('blob:')) {
        URL.revokeObjectURL(avatarPreview);
      }
      
      // Reset preview to original on error
      setAvatarPreview(profile.avatar_url || '');
      
      const errorMessage = err?.message || 'Erreur lors de l\'upload de la photo';
      setToast({ message: errorMessage, type: 'error' });
    } finally {
      setUploadingAvatar(false);
    }
  };

  // Cleanup blob URLs on unmount (if any)
  useEffect(() => {
    return () => {
      if (avatarPreview && avatarPreview.startsWith('blob:')) {
        URL.revokeObjectURL(avatarPreview);
      }
    };
  }, [avatarPreview]);

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

    try {
      // Avatar is already uploaded and updated in handleChangeAvatar
      // Just use the current preview URL (which is the public URL after upload)
      const finalAvatarUrl = avatarPreview && avatarPreview.startsWith('http') 
        ? avatarPreview 
        : profile.avatar_url || null;

      // Only send allowed fields: username, display_name, bio, avatar_url
      const updates = {
        username: username.trim().toLowerCase(),
        display_name: displayName.trim(),
        bio: bio.trim() || null,
        avatar_url: finalAvatarUrl || null,
      };
      
      console.log('[EditProfileModal] Updating profile with avatar_url:', finalAvatarUrl);

      const { error: updateError } = await supabase
        .from('user_profiles')
        .update(updates)
        .eq('id', user.id);

      if (updateError) {
        console.error('[EditProfileModal] DB update error', {
          code: updateError.code,
          message: updateError.message,
        });
        if (updateError.code === '23505') {
          setError('Ce nom d\'utilisateur est déjà pris');
        } else {
          const errorMsg = `Erreur DB: ${updateError.code || 'unknown'} - ${updateError.message}`;
          setError(errorMsg);
          setToast({ message: errorMsg, type: 'error' });
        }
        setSaving(false);
        return;
      }
      
      console.log('[EditProfileModal] Profile update OK');
      
      // Verify the saved value
      const { data: savedProfile, error: selectError } = await supabase
        .from('user_profiles')
        .select('avatar_url')
        .eq('id', user.id)
        .maybeSingle();
      
      if (!selectError) {
        console.log('[EditProfileModal] Saved avatar_url:', savedProfile?.avatar_url);
      }

      // Update via context and refresh profile
      if (updateProfile) {
        await updateProfile(updates);
      }
      await refreshProfile(user.id);

      setSaving(false);
      onSave();
      onClose();
    } catch (err: any) {
      console.error('[EditProfileModal] Save error:', err);
      setError('Erreur lors de la sauvegarde');
      setSaving(false);
    }
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (import.meta.env.DEV) {
      console.log('[EditProfileModal] overlay click');
    }
    if (e.target === e.currentTarget) {
      if (ignoreBackdropRef.current) {
        if (import.meta.env.DEV) {
          console.log('[EditProfileModal] Ignoring backdrop click during picker');
        }
        return;
      }
      if (uploadingAvatar) {
        if (import.meta.env.DEV) {
          console.log('[EditProfileModal] Prevented close during upload');
        }
        return;
      }
      onClose();
    }
  };

  const handleModalContainerClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={handleOverlayClick}>
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden" onClick={handleModalContainerClick}>
        <div className="flex-shrink-0 bg-white border-b border-stone-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold">Modifier le profil</h2>
          <button
            type="button"
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
              <button
                type="button"
                onClick={handleChangeAvatar}
                disabled={uploadingAvatar || saving}
                className="relative flex-shrink-0"
              >
                <div className="w-24 h-24 rounded-full bg-stone-200 flex items-center justify-center overflow-hidden">
                  {avatarPreview ? (
                    <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-3xl font-bold text-stone-600">
                      {displayName.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
              </button>
              <div className="flex-1">
                <p className="text-sm text-stone-600 mb-2">
                  Choisissez une photo pour votre profil
                </p>
                <button
                  type="button"
                  onClick={handleChangeAvatar}
                  disabled={uploadingAvatar || saving}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 text-sm"
                >
                  <ImageIcon className="w-4 h-4" />
                  <span>Changer la photo</span>
                </button>
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
                      type="button"
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
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-3 border border-stone-300 text-stone-900 rounded-xl hover:bg-stone-50 transition-colors font-medium"
          >
            Annuler
          </button>
          <button
            type="button"
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

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
