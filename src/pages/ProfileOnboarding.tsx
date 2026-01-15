import { useState, useRef, useEffect } from 'react';
import { Camera as CapacitorCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { debugLog, debugError } from '../utils/logger';
import { uploadImageToBucket } from '../lib/storageUpload';
import { Camera, Image as ImageIcon, ArrowRight, ArrowLeft, Check, Loader2 } from 'lucide-react';

export function ProfileOnboarding() {
  const { user, profile, updateProfile, refreshProfile } = useAuth();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showCongrats, setShowCongrats] = useState(false);

  // Extra safety: prevent showing onboarding if user is already onboarded
  useEffect(() => {
    if (profile?.onboarding_completed === true) {
      debugLog('[ProfileOnboarding] ⚠️ User already onboarded, preventing display', {
        userId: user?.id,
        onboarding_completed: profile.onboarding_completed,
      });
      // Profile is already complete, this screen shouldn't be shown
      // The parent App.tsx should handle routing, but this is a safety guard
    }
  }, [profile?.onboarding_completed, user?.id]);

  // Step 1: Username
  const [username, setUsername] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [usernameValid, setUsernameValid] = useState<boolean | null>(null); // null = not checked, true = available, false = taken
  const usernameCheckTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const usernameCheckReqId = useRef(0);

  // Step 2: Profile
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');

  // Step 3: Avatar
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(profile?.avatar_url ?? null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Always 3 steps (username, profil, avatar)
  const totalSteps = 3;

  // Initialize display name from user email if available (only once)
  const didInitDisplayName = useRef(false);
  useEffect(() => {
    if (didInitDisplayName.current) return;
    if (!user?.email) return;

    const emailName = user.email.split('@')[0];
    setDisplayName((prev) => prev || (emailName.charAt(0).toUpperCase() + emailName.slice(1)));

    didInitDisplayName.current = true;
  }, [user?.email]);

  // Load existing avatar URL on mount
  useEffect(() => {
    if (profile?.avatar_url) {
      setAvatarPreviewUrl(profile.avatar_url);
    }
  }, [profile?.avatar_url]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (usernameCheckTimeout.current) {
        clearTimeout(usernameCheckTimeout.current);
      }
    };
  }, []);

  // Check username uniqueness
  const checkUsername = async (value: string) => {
    if (!value || value.length < 3) {
      setUsernameError('');
      setUsernameValid(null);
      return false;
    }

    // Validate format: alphanumeric + underscore, no spaces
    if (!/^[a-zA-Z0-9_]+$/.test(value)) {
      setUsernameError('Le nom d\'utilisateur ne peut contenir que des lettres, chiffres et underscores');
      setUsernameValid(false);
      return false;
    }

    // Increment reqId to cancel previous requests
    const currentReqId = ++usernameCheckReqId.current;
    setCheckingUsername(true);
    setUsernameValid(null);

    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('username', value.toLowerCase())
        .maybeSingle();

      // Check if this request is still valid (user might have continued typing)
      if (currentReqId !== usernameCheckReqId.current) {
        // This request is outdated, ignore result
        return false;
      }

      if (error && error.code !== 'PGRST116') {
        setUsernameError('Erreur lors de la vérification');
        setCheckingUsername(false);
        setUsernameValid(false);
        return false;
      }

      if (data) {
        setUsernameError('Ce nom d\'utilisateur est déjà pris');
        setCheckingUsername(false);
        setUsernameValid(false);
        return false;
      }

      setUsernameError('');
      setCheckingUsername(false);
      setUsernameValid(true);
      return true;
    } catch (err: any) {
      // Check if this request is still valid
      if (currentReqId !== usernameCheckReqId.current) {
        return false;
      }
      debugError('[ProfileOnboarding] Error checking username:', err);
      setUsernameError('Erreur lors de la vérification');
      setCheckingUsername(false);
      setUsernameValid(false);
      return false;
    }
  };

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toLowerCase().replace(/\s/g, '');
    setUsername(value);
    setUsernameError('');
    setUsernameValid(null);

    // Clear previous timeout
    if (usernameCheckTimeout.current) {
      clearTimeout(usernameCheckTimeout.current);
    }

    // Cancel any pending request
    usernameCheckReqId.current++;

    if (value.length >= 3) {
      // Debounce: wait 350ms before checking
      usernameCheckTimeout.current = setTimeout(() => {
        checkUsername(value); // Don't await here
      }, 350);
    } else {
      setCheckingUsername(false);
      setUsernameValid(null);
    }
  };

  const handleCameraSource = async (cameraSource: CameraSource) => {
    if (!Capacitor.isNativePlatform()) {
      fileInputRef.current?.click();
      return;
    }

    // Handle simulator fallback for camera
    if (cameraSource === CameraSource.Camera && Capacitor.getPlatform() === 'ios') {
      try {
        await pickPhoto(CameraSource.Camera);
      } catch (cameraError: any) {
        // If camera fails (e.g., simulator), fallback to gallery
        if (cameraError.message?.includes('not available') || cameraError.message?.includes('simulator')) {
          setAvatarError('Caméra indisponible. Utilisation de la galerie...');
          await pickPhoto(CameraSource.Photos);
        } else {
          throw cameraError;
        }
      }
    } else {
      // Normal flow for gallery or non-iOS camera
      await pickPhoto(cameraSource);
    }
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!file.type.startsWith('image/')) {
      setAvatarError('Le fichier doit être une image');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setAvatarError('L\'image ne doit pas dépasser 10 Mo');
      return;
    }

    try {
      setAvatarError(null);
      
      // ✅ preview immédiate
      const reader = new FileReader();
      reader.onload = (e) => {
        setAvatarPreviewUrl(e.target?.result as string);
      };
      reader.readAsDataURL(file);

      // ✅ upload
      setAvatarUploading(true);

      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const finalExt = ext === 'png' ? 'png' : 'jpg';
      const path = `${user.id}/avatar/${Date.now()}.${finalExt}`;

      // Create blob URL for upload helper
      const blobUrl = URL.createObjectURL(file);

      try {
        const { publicUrl } = await uploadImageToBucket({
          bucket: 'avatars',
          path,
          fileUriOrUrl: blobUrl,
          contentType: file.type || 'image/jpeg',
          upsert: true,
        });

        // Cleanup blob URL
        URL.revokeObjectURL(blobUrl);

      const { error: dbErr } = await supabase
        .from('user_profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', user.id);

      if (dbErr) throw dbErr;

      // ✅ Mettre à jour la preview avec l'URL publique
      setAvatarPreviewUrl(publicUrl);
      
      // ✅ Refresh profile pour synchroniser
      await refreshProfile();
      } catch (uploadErr: any) {
        // Cleanup blob URL even on error
        URL.revokeObjectURL(blobUrl);
        throw uploadErr;
      }
    } catch (err: any) {
      console.error('[Avatar] handleFileInput error', err);
      setAvatarError(err?.message ?? 'Erreur lors de l\'upload de l\'avatar. Reconnecte-toi si besoin.');
      // Réinitialiser la preview en cas d'erreur
      if (profile?.avatar_url) {
        setAvatarPreviewUrl(profile.avatar_url);
      } else {
        setAvatarPreviewUrl(null);
      }
    } finally {
      setAvatarUploading(false);
    }
  };

  async function pickPhoto(source: CameraSource) {
    if (!user) return;

    try {
      setAvatarError(null);

      // Check permissions first
      try {
        const { Camera } = await import('@capacitor/camera');
        const permissions = await Camera.checkPermissions();
        
        if (source === CameraSource.Camera) {
          if (permissions.camera !== 'granted') {
            const requestResult = await Camera.requestPermissions({ permissions: ['camera'] });
            if (requestResult.camera !== 'granted') {
              setAvatarError('Permission caméra refusée. Ouvrez les Réglages pour autoriser l\'accès.');
              return;
            }
          }
        } else if (source === CameraSource.Photos) {
          if (permissions.photos !== 'granted') {
            const requestResult = await Camera.requestPermissions({ permissions: ['photos'] });
            if (requestResult.photos !== 'granted') {
              setAvatarError('Permission galerie refusée. Ouvrez les Réglages pour autoriser l\'accès.');
              return;
            }
          }
        }
      } catch (permError: any) {
        debugError('[ProfileOnboarding] Permission check error:', permError);
        // Continue anyway, might work on some platforms
      }

      const photo = await CapacitorCamera.getPhoto({
        source: source,
        resultType: CameraResultType.Uri,
        quality: 85,
      });

      if (!photo?.webPath) throw new Error('No photo selected');

      // ✅ preview immédiate
      setAvatarPreviewUrl(photo.webPath);

      // ✅ upload
      setAvatarUploading(true);

      const ext = (photo.format || 'jpeg').toLowerCase();
      const finalExt = ext === 'png' ? 'png' : 'jpg';
      const path = `${user.id}/avatar/${Date.now()}.${finalExt}`;

      // Use the photo URI directly - uploadImageToBucket will handle iOS conversion
      const { publicUrl } = await uploadImageToBucket({
        bucket: 'avatars',
        path,
        fileUriOrUrl: photo.webPath,
        contentType: `image/${finalExt === 'png' ? 'png' : 'jpeg'}`,
          upsert: true,
        });

      const { error: dbErr } = await supabase
        .from('user_profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', user.id);

      if (dbErr) throw dbErr;

      // ✅ Mettre à jour la preview avec l'URL publique
      setAvatarPreviewUrl(publicUrl);
      
      // ✅ Refresh profile pour synchroniser
      await refreshProfile();
    } catch (e: any) {
      if (e?.message?.includes('cancel') || e?.message?.includes('User cancelled')) {
        return;
      }
      console.error('[Avatar] pickPhoto error', e);
      setAvatarError(e?.message ?? 'Erreur sélection photo');
      // Réinitialiser la preview en cas d'erreur
      if (profile?.avatar_url) {
        setAvatarPreviewUrl(profile.avatar_url);
      } else {
        setAvatarPreviewUrl(null);
      }
    } finally {
      setAvatarUploading(false);
    }
  }

  async function pickFromGallery() {
    await pickPhoto(CameraSource.Photos);
  }


  const handleNext = async () => {
    debugLog('[ProfileOnboarding] handleNext called', { step, totalSteps, loading, checkingUsername, avatarUploading });
    setError('');

    if (step === 1) {
      // Validate username
      if (!username || username.length < 3) {
        setUsernameError('Le nom d\'utilisateur doit contenir au moins 3 caractères');
        return;
      }

      // If username is not validated yet, check it now
      if (usernameValid === null || checkingUsername) {
        // Wait for current check to complete
        if (checkingUsername) {
          // Wait a bit for the check to complete
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        const isValid = await checkUsername(username);
        if (!isValid || usernameError || usernameValid === false) {
          return;
        }
      } else if (usernameValid === false) {
        // Username is already known to be invalid
        return;
      }

      setStep(2);
    } else if (step === 2) {
      // Validate display name
      if (!displayName || displayName.trim().length === 0) {
        setError('Le nom affiché est requis');
        return;
      }

      if (bio && bio.length > 160) {
        setError('La bio ne doit pas dépasser 160 caractères');
        return;
      }

      setStep(3);
    } else if (step === 3) {
      // Avatar déjà géré à la sélection, on termine
      debugLog('[ProfileOnboarding] Step 3: Finishing onboarding');
      await finishOnboarding();
    }
  };

  const finishOnboarding = async () => {
    debugLog('[ProfileOnboarding] finishOnboarding called', { username, displayName, bio });
    setLoading(true);
    setError('');

    try {
      // Update profile with all collected data
      const updates: any = {
        username: username.toLowerCase(),
        display_name: displayName.trim(),
        bio: bio.trim() || null,
        onboarding_completed: true,
      };

      // Avatar already uploaded in step 3 if selected (upload is immediate)

      const { error } = await updateProfile(updates);

      if (error) {
        setError(error.message || 'Erreur lors de la sauvegarde');
        setLoading(false);
        return;
      }

      // Refresh profile to get latest data
      await refreshProfile();
      // Show celebration screen; navigation will happen after user clicks "Commencer"
      setShowCongrats(true);
      setLoading(false);
    } catch (err: any) {
      debugError('[ProfileOnboarding] Error finishing onboarding:', err);
      setError('Erreur lors de la sauvegarde');
      setLoading(false);
    }
  };

  const handleBack = () => {
    if (step > 1 && !showCongrats) {
      setStep(step - 1);
      setError('');
    }
  };

  const handleGoHome = () => {
    window.history.pushState('/home', '', '/home');
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  return (
    <div className="min-h-screen bg-background-light flex flex-col relative" style={{ zIndex: 1 }}>
      {/* Header with progress - Safe area top */}
      <div className="bg-white border-b border-gray-200 px-4 py-4 safe-area-top">
        <div className="max-w-md mx-auto">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-lg font-semibold text-text-main-light">
              Étape {step} sur {totalSteps}
            </h1>
            {step > 1 && (
              <button
                onClick={handleBack}
                className="text-text-sub-light hover:text-text-main-light transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-primary h-2 rounded-full transition-all duration-300"
              style={{ width: `${(step / totalSteps) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-8" style={{ position: 'relative', zIndex: 1 }}>
        <div className="max-w-md mx-auto space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Step 1: Username */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-2xl font-bold text-text-main-light mb-2">
                  Choisissez un nom d'utilisateur
                </h2>
                <p className="text-text-sub-light">
                  Ce nom sera visible par les autres utilisateurs. Vous pourrez le modifier plus tard.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-main-light mb-2">
                  Nom d'utilisateur
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-sub-light">@</span>
                  <input
                    type="text"
                    value={username}
                    onChange={handleUsernameChange}
                    className="w-full pl-8 pr-10 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-white text-text-main-light"
                    placeholder="alexreader"
                    disabled={loading}
                    maxLength={30}
                  />
                  {checkingUsername && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <Loader2 className="w-4 h-4 text-text-sub-light animate-spin" />
                    </div>
                  )}
                  {!checkingUsername && usernameValid === true && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <Check className="w-4 h-4 text-green-600" />
                    </div>
                  )}
                </div>
                {checkingUsername && (
                  <p className="text-xs text-text-sub-light mt-1">Vérification...</p>
                )}
                {usernameError && (
                  <p className="text-xs text-red-600 mt-1">{usernameError}</p>
                )}
                {!usernameError && username.length >= 3 && !checkingUsername && usernameValid === true && (
                  <p className="text-xs text-green-600 mt-1">
                    <Check className="w-3 h-3 inline mr-1" />
                    Disponible
                  </p>
                )}
                <p className="text-xs text-text-sub-light mt-1">
                  Minimum 3 caractères. Lettres, chiffres et underscores uniquement.
                </p>
              </div>
            </div>
          )}

          {/* Step 2: Profile */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-2xl font-bold text-text-main-light mb-2">
                  Complétez votre profil
                </h2>
                <p className="text-text-sub-light">
                  Ces informations seront visibles sur votre profil public.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-main-light mb-2">
                  Nom complet <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-white text-text-main-light"
                  placeholder="Alex Reader"
                  required
                  disabled={loading}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-main-light mb-2">
                  Bio (optionnel)
                </label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-white text-text-main-light resize-none"
                  placeholder="Parlez-nous de vous..."
                  rows={4}
                  maxLength={160}
                  disabled={loading}
                />
                <p className="text-xs text-text-sub-light mt-1">
                  {bio.length}/160 caractères
                </p>
              </div>
            </div>
          )}

          {/* Step 3: Avatar */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-2xl font-bold text-text-main-light mb-2">
                  Ajoutez une photo de profil
                </h2>
                <p className="text-text-sub-light">
                  Vous pourrez la modifier plus tard. (Optionnel)
                </p>
              </div>

              <div className="flex flex-col items-center space-y-4">
                <div className="relative">
                  <div className="w-32 h-32 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden">
                    {avatarPreviewUrl && (avatarPreviewUrl.startsWith('http://') || avatarPreviewUrl.startsWith('https://') || avatarPreviewUrl.startsWith('data:') || avatarPreviewUrl.startsWith('/')) ? (
                      <img src={avatarPreviewUrl} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-4xl font-bold text-gray-600">
                        {displayName.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  {avatarUploading && (
                    <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center">
                      <Loader2 className="w-8 h-8 text-white animate-spin" />
                    </div>
                  )}
                </div>

                {avatarError && (
                  <div className="w-full bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">
                    {avatarError}
                  </div>
                )}

                <div className="flex gap-3 w-full">
                  <button
                    type="button"
                    onClick={() => handleCameraSource(CameraSource.Camera)}
                    disabled={avatarUploading || loading}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Camera className="w-5 h-5" />
                    <span>Caméra</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCameraSource(CameraSource.Photos)}
                    disabled={avatarUploading || loading}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ImageIcon className="w-5 h-5" />
                    <span>Galerie</span>
                  </button>
                </div>

                {avatarUploading && (
                  <p className="text-sm text-text-sub-light">Upload en cours...</p>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileInput}
                  className="hidden"
                />

                {avatarPreviewUrl && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      debugLog('[ProfileOnboarding] Delete photo clicked', { avatarUploading });
                      if (avatarUploading) {
                        debugLog('[ProfileOnboarding] Upload in progress, ignoring delete');
                        return;
                      }
                      setAvatarPreviewUrl(profile?.avatar_url ?? null);
                      setAvatarFile(null);
                      setAvatarError(null);
                    }}
                    disabled={avatarUploading}
                    className="text-sm text-red-600 hover:text-red-700 disabled:opacity-50 cursor-pointer relative"
                    style={{ 
                      pointerEvents: avatarUploading ? 'none' : 'auto',
                      zIndex: 15,
                      position: 'relative'
                    }}
                  >
                    Supprimer la photo
                  </button>
                )}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Footer with Next button - Safe area bottom */}
      <div className="bg-white border-t border-gray-200 px-4 py-4 safe-area-bottom relative" style={{ zIndex: 10 }}>
        <div className="max-w-md mx-auto">
          <button
            onClick={async (e) => {
              e.preventDefault();
              e.stopPropagation();
              debugLog('[ProfileOnboarding] Button clicked', { step, totalSteps, loading, checkingUsername, avatarUploading });
              
              if (loading || checkingUsername) {
                debugLog('[ProfileOnboarding] Button disabled, ignoring click');
                return;
              }
              
              try {
                await handleNext();
              } catch (err) {
                debugError('[ProfileOnboarding] Error in handleNext', err);
                setError('Une erreur est survenue. Veuillez réessayer.');
              }
            }}
            disabled={loading || checkingUsername}
            className="w-full bg-primary text-black py-3 rounded-lg font-semibold hover:brightness-95 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 relative"
            type="button"
            style={{ 
              pointerEvents: loading || checkingUsername ? 'none' : 'auto',
              zIndex: 20,
              position: 'relative'
            }}
          >
            {loading ? (
              <>
                <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                <span>Sauvegarde...</span>
              </>
            ) : step === totalSteps ? (
              'Terminer'
            ) : (
              <>
                <span>Suivant</span>
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </div>
      </div>

      {/* Celebration overlay */}
      {showCongrats && (
        <div className="fixed inset-0 bg-black/50 z-[1200] flex items-center justify-center px-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 w-full max-w-md p-6 space-y-4 text-center">
            <div className="text-5xl">🎉</div>
            <h3 className="text-2xl font-bold text-text-main-light">
              Bienvenue sur Lexu !
            </h3>
            <p className="text-text-sub-light text-sm">
              Ton profil est prêt. Découvre tes livres, tes sessions et partage avec tes amis.
            </p>
            <button
              onClick={handleGoHome}
              className="w-full bg-primary text-black py-3 rounded-lg font-semibold hover:brightness-95 transition-colors"
            >
              Commencer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

