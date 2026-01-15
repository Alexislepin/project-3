import { useState, useEffect, useRef } from 'react';
import { X, Check, Image as ImageIcon } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Toast } from './Toast';
import { UploadOverlay } from './UploadOverlay';
import { Capacitor } from '@capacitor/core';
import { uploadImageToSupabase } from '../lib/imageUpload';
import { ModalPortal } from './ModalPortal';
import lightStyles from './EditProfileModal.light.module.css';
import darkStyles from './EditProfileModal.dark.module.css';

/**
 * Resize an image file to max 512px with quality 0.82
 * Prevents iOS memory crashes and speeds up upload
 */
async function resizeImageFile(file: File | Blob, maxSize: number = 512, quality: number = 0.82): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (event) => {
      const img = new Image();
      
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        // Calculate new dimensions (maintain aspect ratio)
        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = (height * maxSize) / width;
            width = maxSize;
          } else {
            width = (width * maxSize) / height;
            height = maxSize;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }
        
        // Draw and compress
        ctx.drawImage(img, 0, 0, width, height);
        
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Failed to resize image'));
            }
          },
          'image/jpeg',
          quality
        );
      };
      
      img.onerror = () => {
        reject(new Error('Failed to load image'));
      };
      
      if (typeof event.target?.result === 'string') {
        img.src = event.target.result;
      } else {
        reject(new Error('Failed to read file'));
      }
    };
    
    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };
    
    reader.readAsDataURL(file);
  });
}

interface EditProfileModalProps {
  profile: any;
  onClose: () => void;
  onSave: () => void;
}

const getIsDarkMode = () => {
  if (typeof document === 'undefined') return false;

  const rootHasDark =
    document.documentElement.classList.contains('theme-dark') ||
    document.documentElement.classList.contains('dark');

  const bodyHasDark =
    (typeof document.body !== 'undefined' && document.body.classList.contains('theme-dark')) ||
    (typeof document.body !== 'undefined' && document.body.classList.contains('dark'));

  if (rootHasDark || bodyHasDark) {
    return true;
  }

  // Fallback to system preference when no explicit theme class is set
  if (typeof window !== 'undefined' && 'matchMedia' in window) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  return false;
};

export function EditProfileModal({ profile, onClose, onSave }: EditProfileModalProps) {
  const [displayName, setDisplayName] = useState(profile.display_name || '');
  const [username, setUsername] = useState(profile.username || '');
  const [bio, setBio] = useState(profile.bio || '');
  const [interests, setInterests] = useState<string[]>(profile.interests || []);
  const [newInterest, setNewInterest] = useState('');
  const [avatarPreview, setAvatarPreview] = useState(profile.avatar_url || '');
  const [saving, setSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const { user, updateProfile, refreshProfile } = useAuth();
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);
  const [pendingAvatarPreviewUrl, setPendingAvatarPreviewUrl] = useState<string | null>(null);
  const [uploadToast, setUploadToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => getIsDarkMode());

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const updateTheme = () => {
      setIsDarkMode(getIsDarkMode());
    };

    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    const mediaQuery = typeof window !== 'undefined' && 'matchMedia' in window ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    mediaQuery?.addEventListener('change', updateTheme);

    // Ensure we sync immediately in case the initial state changed before mount
    updateTheme();

    return () => {
      observer.disconnect();
      mediaQuery?.removeEventListener('change', updateTheme);
    };
  }, []);
  
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const isPickingAvatarRef = useRef(false);

  const handleAddInterest = () => {
    if (newInterest.trim() && !interests.includes(newInterest.trim())) {
      setInterests([...interests, newInterest.trim()]);
      setNewInterest('');
    }
  };

  const handleRemoveInterest = (interest: string) => {
    setInterests(interests.filter((i) => i !== interest));
  };

  const handleChangeAvatar = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    console.log('[EditProfileModal] choose photo click');
    
    if (!user?.id) {
      setToast({ message: 'Erreur: utilisateur non connecté', type: 'error' });
      return;
    }
    
    if (avatarUploading || saving || isPickingAvatarRef.current) {
      console.log('[EditProfileModal] blocked: uploading or saving or picking', {
        avatarUploading,
        saving,
        isPicking: isPickingAvatarRef.current,
      });
      return;
    }
    
    setError('');
    
    // Set picking state (prevents modal closure)
    isPickingAvatarRef.current = true;
    
    console.log('[EditProfileModal] opening file picker', {
      inputRef: avatarInputRef.current,
    });
    
    // SYNCHRONE: pas d'await avant click()
    avatarInputRef.current?.click();
    
    // Reset picking state after delay (iOS needs time to settle)
    setTimeout(() => {
      isPickingAvatarRef.current = false;
    }, 400);
  };

  const onAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    
    console.log('[EditProfileModal] file selected', {
      file: file ? { type: file.type, size: file.size, name: file.name } : null,
    });
    
    if (!file) {
      console.log('[EditProfileModal] canceled/no file');
      isPickingAvatarRef.current = false;
      return;
    }

    // Reset input value so picking the same file works again
    e.target.value = '';

    if (!file.type.startsWith('image/')) {
      setToast({ message: 'Le fichier sélectionné n\'est pas une image', type: 'error' });
      isPickingAvatarRef.current = false;
      return;
    }

    // Cleanup previous preview URL
    if (pendingAvatarPreviewUrl) {
      URL.revokeObjectURL(pendingAvatarPreviewUrl);
    }

    setPendingAvatarFile(file);
    setPendingAvatarPreviewUrl(URL.createObjectURL(file));
    
    // Reset picking state after file is selected
    isPickingAvatarRef.current = false;
  };

  const confirmAvatarUpload = async (): Promise<string | undefined> => {
    if (!user?.id || !pendingAvatarFile || avatarUploading) return;
    
    setError('');
    setAvatarUploading(true);
    
    try {
      // Resize image before upload (prevents iOS memory crashes)
      let resizedBlob: Blob;
      try {
        resizedBlob = await resizeImageFile(pendingAvatarFile, 512, 0.82);
        if (import.meta.env.DEV) {
          console.log('[EditProfileModal] Image resized', {
            originalSize: pendingAvatarFile.size,
            resizedSize: resizedBlob.size,
            reduction: `${Math.round((1 - resizedBlob.size / pendingAvatarFile.size) * 100)}%`,
          });
        }
      } catch (resizeError) {
        console.error('[EditProfileModal] Resize error, using original', resizeError);
        // Fallback to original if resize fails
        resizedBlob = pendingAvatarFile;
      }
      
      // Use unified upload helper with resized blob
      const { publicUrl } = await uploadImageToSupabase(supabase, {
        bucket: 'avatars',
        userId: user.id,
        kind: 'avatar',
        blob: resizedBlob,
        ext: 'jpg', // Always JPEG after resize
      });
      
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
      if (pendingAvatarPreviewUrl) {
        URL.revokeObjectURL(pendingAvatarPreviewUrl);
      }
      setAvatarPreview(publicUrl);
      setPendingAvatarFile(null);
      setPendingAvatarPreviewUrl(null);
      
      // Refresh profile in context
      await refreshProfile(user.id);
      
      // Show success toast (auto-dismiss after 1.2s)
      setUploadToast({ type: 'success', msg: '✅ Photo de profil mise à jour' });
      setTimeout(() => {
        setUploadToast(null);
      }, 1200);
      
      if (import.meta.env.DEV) {
        console.log('[EditProfileModal] avatar update complete');
      }

      return publicUrl;
      
    } catch (err: any) {
      console.error('[EditProfileModal] upload error', err);
      
      // Cleanup blob URL if created
      if (pendingAvatarPreviewUrl) {
        URL.revokeObjectURL(pendingAvatarPreviewUrl);
      }
      
      const errorMessage = err?.message || 'Erreur lors de l\'upload de la photo';
      setUploadToast({ type: 'error', msg: `Échec de l'import: ${errorMessage}` });
      setTimeout(() => {
        setUploadToast(null);
      }, 3000);
    } finally {
      setAvatarUploading(false);
    }
  };

  // Cleanup blob URLs on unmount or when preview changes
  useEffect(() => {
    return () => {
      if (pendingAvatarPreviewUrl) {
        URL.revokeObjectURL(pendingAvatarPreviewUrl);
      }
    };
  }, [pendingAvatarPreviewUrl]);

  const handleSave = async () => {
    if (!user) {
      console.error('[EditProfileModal] ❌ No user');
      setError('Erreur: utilisateur non connecté');
      setToast({ message: 'Erreur: utilisateur non connecté', type: 'error' });
      return;
    }

    console.log('[EditProfileModal] 🔵 handleSave called', {
      platform: Capacitor.getPlatform(),
      userId: user.id,
      hasPendingAvatarFile: !!pendingAvatarFile,
      avatarPreview: avatarPreview?.substring(0, 50),
    });

    if (!displayName.trim()) {
      console.error('[EditProfileModal] ❌ Missing display name');
      setError('Le nom affiché est requis');
      return;
    }

    if (!username.trim()) {
      console.error('[EditProfileModal] ❌ Missing username');
      setError('Le nom d\'utilisateur est requis');
      return;
    }

    // If avatar file exists but hasn't been uploaded, upload it now
    if (pendingAvatarFile) {
      console.warn('[EditProfileModal] ⚠️ Avatar file exists, uploading now inside save');
      const url = await confirmAvatarUpload();
      if (!url) {
        setError('Upload de la photo non finalisé');
        return;
      }
    }

    setSaving(true);
    setError('');

    try {
      // Avatar is already uploaded and updated in handleUploadAvatar
      // Just use the current preview URL (which is the public URL after upload)
      const finalAvatarUrl = avatarPreview && avatarPreview.startsWith('http') && !avatarPreview.startsWith('blob:')
        ? avatarPreview 
        : profile.avatar_url || null;

      // Only send allowed fields: username, display_name, bio, avatar_url
      const updates = {
        username: username.trim().toLowerCase(),
        display_name: displayName.trim(),
        bio: bio.trim() || null,
        avatar_url: finalAvatarUrl || null,
      };
      
      console.log('[EditProfileModal] 🔵 Updating profile', {
        platform: Capacitor.getPlatform(),
        userId: user.id,
        updates: { ...updates, avatar_url: finalAvatarUrl?.substring(0, 50) },
      });

      const { error: updateError } = await supabase
        .from('user_profiles')
        .update(updates)
        .eq('id', user.id);

      if (updateError) {
        console.error('[EditProfileModal] ❌ DB update error', {
          error: updateError,
          errorString: JSON.stringify(updateError),
          code: updateError.code,
          message: updateError.message,
          details: (updateError as any).details,
          hint: (updateError as any).hint,
          platform: Capacitor.getPlatform(),
        });
        
        if (updateError.code === '23505') {
          setError('Ce nom d\'utilisateur est déjà pris');
          setToast({ message: 'Ce nom d\'utilisateur est déjà pris', type: 'error' });
        } else {
          const errorMsg = `Erreur DB: ${updateError.code || 'unknown'} - ${updateError.message}`;
          setError(errorMsg);
          setToast({ message: errorMsg, type: 'error' });
        }
        setSaving(false);
        return;
      }
      
      console.log('[EditProfileModal] ✅ Profile update OK');
      
      // Verify the saved value
      const { data: savedProfile, error: selectError } = await supabase
        .from('user_profiles')
        .select('avatar_url')
        .eq('id', user.id)
        .maybeSingle();
      
      if (!selectError) {
        console.log('[EditProfileModal] ✅ Saved avatar_url:', savedProfile?.avatar_url);
      } else {
        console.warn('[EditProfileModal] ⚠️ Error verifying saved profile:', selectError);
      }

      // Update via context and refresh profile
      if (updateProfile) {
        await updateProfile(updates);
      }
      await refreshProfile(user.id);

      console.log('[EditProfileModal] ✅ Save complete');
      setSaving(false);
      setToast({ message: 'Profil mis à jour avec succès', type: 'success' });
      onSave();
      onClose();
    } catch (err: any) {
      console.error('[EditProfileModal] ❌ Save error', {
        error: err,
        errorString: JSON.stringify(err),
        message: err?.message,
        stack: err?.stack,
        code: err?.code,
        platform: Capacitor.getPlatform(),
      });
      const errorMessage = err?.message || 'Erreur lors de la sauvegarde';
      setError(errorMessage);
      setToast({ message: errorMessage, type: 'error' });
      setSaving(false);
    }
  };

  const safeClose = () => {
    if (isPickingAvatarRef.current) return;
    if (pendingAvatarFile) return; // exige confirmation
    if (avatarUploading || saving) return;
    onClose();
  };

  const handleClose = () => {
    safeClose();
  };

  useEffect(() => {
    if (import.meta.env.DEV) {
      console.log('[Modal] mounted EditProfileModal');
    }
  }, []);

  return (
    <>
      <ModalPortal
      onBackdropClick={() => {
        // CRITICAL: Prevent close during picker or upload
        if (isPickingAvatarRef.current || pendingAvatarFile || avatarUploading || saving) {
          if (import.meta.env.DEV) {
            console.log('[EditProfileModal] Prevented close during picker/upload/save');
          }
          return;
        }
        safeClose();
      }}
      onContentClick={(e) => {
        e.stopPropagation();
      }}
    >
      <div className="bg-white dark:bg-[#0f0f0f] rounded-2xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex-shrink-0 bg-white dark:bg-[#0f0f0f] border-b border-stone-200 dark:border-stone-700 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold dark:text-white">Modifier le profil</h2>
          <button
            type="button"
            onClick={handleClose}
            disabled={avatarUploading || isPickingAvatarRef.current || !!pendingAvatarFile || saving}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="p-6 space-y-5 dark:bg-[#0f0f0f]" style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}>
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <div>
            <label className={`block text-sm font-semibold mb-3 ${isDarkMode ? darkStyles.label : lightStyles.label}`}>
              Photo de profil
            </label>
            <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={handleChangeAvatar}
            onPointerDown={(e) => e.stopPropagation()}
            disabled={avatarUploading || saving || isPickingAvatarRef.current}
            className="relative flex-shrink-0"
          >
            <div className="w-24 h-24 rounded-full bg-stone-200 dark:bg-stone-700 flex items-center justify-center overflow-hidden">
              {pendingAvatarPreviewUrl ? (
                <img 
                  src={pendingAvatarPreviewUrl} 
                  alt="Avatar preview" 
                  className="w-full h-full object-cover"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : avatarPreview ? (
                <img 
                  src={avatarPreview} 
                  alt="Avatar" 
                  className="w-full h-full object-cover"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className="text-3xl font-bold text-stone-600 dark:text-stone-200">
                  {displayName.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
          </button>
          <div className="flex-1">
            <p className="text-sm text-stone-600 dark:!text-white mb-2">
              Choisissez une photo pour votre profil
            </p>
            <div className="space-y-2">
              <button
                type="button"
                onClick={handleChangeAvatar}
                onPointerDown={(e) => e.stopPropagation()}
                disabled={avatarUploading || saving || isPickingAvatarRef.current}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 border border-gray-300 dark:border-stone-700 rounded-lg hover:bg-gray-50 dark:hover:bg-stone-800 transition-colors disabled:opacity-50 text-sm dark:text-white"
              >
                <ImageIcon className="w-4 h-4" />
                <span>Choisir une photo</span>
              </button>
              {pendingAvatarFile && (
                <div className="space-y-1 rounded-lg bg-gray-50 dark:bg-stone-800 border border-gray-200 dark:border-stone-700 px-3 py-2">
                  <p className="text-xs text-stone-600 dark:!text-white">
                    La photo sera envoyée lors de l’enregistrement.
                  </p>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (pendingAvatarPreviewUrl) {
                        URL.revokeObjectURL(pendingAvatarPreviewUrl);
                      }
                      setPendingAvatarFile(null);
                      setPendingAvatarPreviewUrl(null);
                    }}
                    disabled={avatarUploading || saving}
                    className="w-full px-3 py-2 bg-gray-100 dark:bg-stone-700 text-gray-900 dark:text-white rounded-lg hover:bg-gray-200 dark:hover:bg-stone-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                  >
                    Annuler la sélection
                  </button>
                </div>
              )}
            </div>
            <p className="text-xs text-stone-500 dark:!text-white mt-2">
              JPG, PNG ou GIF. Maximum 5 Mo.
            </p>
            
            {/* Hidden file input */}
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              onChange={onAvatarFileChange}
              className="hidden"
            />
          </div>
        </div>
      </div>

          <div>
            <label className="block text-sm font-semibold text-black mb-2">
              Nom affiché
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Votre nom"
              className="w-full px-4 py-3 border border-stone-300 dark:border-stone-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-lime-400 focus:border-transparent bg-white dark:bg-[#0f0f0f] text-black dark:!text-white placeholder:text-stone-400 dark:placeholder:text-stone-200"
              maxLength={50}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-black mb-2">
              Nom d'utilisateur
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-500 dark:!text-white">@</span>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value.replace(/[^a-z0-9_]/g, ''))}
                placeholder="nomutilisateur"
                className="w-full pl-8 pr-4 py-3 border border-stone-300 dark:border-stone-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-lime-400 focus:border-transparent bg-white dark:bg-[#0f0f0f] text-black dark:!text-black placeholder:text-stone-400 dark:placeholder:text-stone-200"
                maxLength={30}
              />
            </div>
            <p className="text-xs text-stone-500 dark:!text-white mt-1">Seulement des lettres minuscules, chiffres et underscores</p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-black mb-2">
              Bio
            </label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Parlez-nous de vous..."
              className="w-full px-4 py-3 border border-stone-300 dark:border-stone-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-lime-400 focus:border-transparent resize-none bg-white dark:bg-[#0f0f0f] text-stone-900 dark:!text-white placeholder:text-stone-400 dark:placeholder:text-stone-200"
              rows={4}
              maxLength={200}
            />
            <p className="text-xs text-stone-500 dark:!text-white mt-1">{bio.length}/200 caractères</p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-black mb-2">
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
                className="flex-1 px-4 py-2 border border-stone-300 dark:border-stone-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-lime-400 focus:border-transparent bg-white dark:bg-[#0f0f0f] text-stone-900 dark:!text-white placeholder:text-stone-400 dark:placeholder:text-stone-200"
                maxLength={30}
              />
              <button
                onClick={handleAddInterest}
                type="button"
                className="px-4 py-2 text-black rounded-xl transition-colors"
                style={{ background: 'unset', backgroundColor: 'rgba(255, 255, 255, 1)', color: 'rgba(0, 0, 0, 1)' }}
              >
                Ajouter
              </button>
            </div>

            {interests.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {interests.map((interest) => (
                  <span
                    key={interest}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-stone-100 dark:bg-stone-800 text-stone-900 dark:!text-white rounded-lg text-sm font-medium"
                  >
                    {interest}
                    <button
                      type="button"
                      onClick={() => handleRemoveInterest(interest)}
                      className="hover:text-red-600 dark:hover:text-red-400 transition-colors"
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

        <div className="flex-shrink-0 border-t border-stone-200 dark:border-stone-700 px-6 py-4 flex gap-3" style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom) + 24px)' }}>
          <button
            type="button"
            onClick={handleClose}
            disabled={avatarUploading || isPickingAvatarRef.current || !!pendingAvatarFile || saving}
            className="flex-1 px-4 py-3 border border-stone-300 dark:border-stone-700 text-black dark:text-white rounded-xl bg-transparent dark:bg-transparent hover:bg-transparent dark:hover:bg-transparent transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Annuler
          </button>
          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleSave();
            }}
            disabled={saving || !displayName.trim() || !username.trim()}
          className="flex-1 px-4 py-3 text-black dark:text-black rounded-xl transition-colors font-medium disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 pointer-events-auto"
          style={{ background: 'unset', backgroundColor: 'rgba(231, 255, 11, 1)', color: 'rgba(0, 0, 0, 1)' }}
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
      </ModalPortal>

      {/* Upload overlay - blocks UI during upload */}
      <UploadOverlay open={avatarUploading} label="Importation de la photo…" />

      {/* Toast for upload result */}
      {uploadToast && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[10000] px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 animate-in slide-in-from-bottom-5"
          style={{
            backgroundColor: uploadToast.type === 'success' ? '#10b981' : '#ef4444',
            color: 'white',
            maxWidth: 'calc(100vw - 2rem)',
          }}
        >
          <span className="text-sm font-medium">{uploadToast.msg}</span>
        </div>
      )}

      {/* Regular toast for other errors */}
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
