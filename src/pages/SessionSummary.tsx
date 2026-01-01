import { useState, useEffect, useRef } from 'react';
import { X, Camera, Quote, Globe, Users, Lock, Plus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { BookCover } from '../components/BookCover';
import { AppHeader } from '../components/AppHeader';
import { updateStreakAfterActivity } from '../utils/streak';
import { Toast } from '../components/Toast';
import { Camera as CapacitorCamera } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { uploadFileToBucket } from '../lib/storageUpload';

interface SessionSummaryProps {
  bookTitle: string;
  bookAuthor: string;
  bookId: string;
  coverUrl?: string | null; // Display cover URL (custom_cover_url or book.cover_url)
  pagesRead: number;
  durationMinutes: number;
  currentPage: number;
  pagesPerHour: number | null;
  minPerPage: number | null;
  activityId: string; // Activity ID from ActiveSession (required - activity created as DRAFT)
  onComplete: () => void;
  onCancel: () => void;
}

type Visibility = 'public' | 'followers' | 'private';

interface Quote {
  text: string;
  page: number;
}

export function SessionSummary({
  bookTitle,
  bookAuthor,
  bookId,
  coverUrl,
  pagesRead,
  durationMinutes,
  currentPage,
  pagesPerHour,
  minPerPage,
  activityId,
  onComplete,
  onCancel,
}: SessionSummaryProps) {
  const [notes, setNotes] = useState('');
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [currentQuote, setCurrentQuote] = useState('');
  const [currentQuotePage, setCurrentQuotePage] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [saving, setSaving] = useState(false);
  const [bookData, setBookData] = useState<{
    isbn?: string | null;
    isbn13?: string | null;
    isbn10?: string | null;
    openlibrary_cover_id?: string | null;
    google_books_id?: string | null;
  } | null>(null);
  const [showAddNoteModal, setShowAddNoteModal] = useState(false);
  const [notePage, setNotePage] = useState<string>('');
  const [noteText, setNoteText] = useState('');
  const [noteTag, setNoteTag] = useState<'citation' | 'idee' | 'question' | null>(null);
  const [savingNote, setSavingNote] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);
  const [photos, setPhotos] = useState<{ file: File; preview: string; uploading?: boolean; url?: string }[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();

  // Handle cancel: delete the draft activity
  const handleCancel = async () => {
    if (user && activityId) {
      // Delete the draft activity
      await supabase
        .from('activities')
        .delete()
        .eq('id', activityId)
        .eq('user_id', user.id);
    }
    onCancel();
  };

  useEffect(() => {
    const fetchBookData = async () => {
      const { data } = await supabase
        .from('books')
        .select('isbn, isbn13, isbn10, openlibrary_cover_id, google_books_id')
        .eq('id', bookId)
        .maybeSingle();

      if (data) {
        setBookData({
          isbn: data.isbn || null,
          isbn13: (data as any).isbn13 || null,
          isbn10: (data as any).isbn10 || null,
          openlibrary_cover_id: (data as any).openlibrary_cover_id || null,
          google_books_id: data.google_books_id || null,
        });
      }
    };

    fetchBookData();
  }, [bookId]);

  const visibilityOptions = [
    { value: 'public' as const, icon: Globe, label: 'Public', description: 'Tout le monde peut voir' },
    { value: 'followers' as const, icon: Users, label: 'Abonnés', description: 'Seulement vos abonnés' },
    { value: 'private' as const, icon: Lock, label: 'Privé', description: 'Seulement vous' },
  ];

  const addQuote = () => {
    if (currentQuote.trim() && currentQuotePage) {
      setQuotes([...quotes, { text: currentQuote.trim(), page: parseInt(currentQuotePage) }]);
      setCurrentQuote('');
      setCurrentQuotePage('');
    }
  };

  const removeQuote = (index: number) => {
    setQuotes(quotes.filter((_, i) => i !== index));
  };

  const handleSelectPhotos = async () => {
    if (!user) return;

    try {
      // Try Capacitor Camera first (iOS/Android)
      if (Capacitor.isNativePlatform()) {
        try {
          const result = await CapacitorCamera.pickImages({
            quality: 80,
            limit: 10,
          });

          if (result.photos && result.photos.length > 0) {
            const newPhotos = await Promise.all(
              result.photos.map(async (photo) => {
                const response = await fetch(photo.webPath!);
                const blob = await response.blob();
                const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
                return {
                  file,
                  preview: photo.webPath!,
                };
              })
            );
            setPhotos((prev) => [...prev, ...newPhotos]);
          }
          return;
        } catch (error) {
          console.log('[SessionSummary] Capacitor Camera not available, using file input:', error);
        }
      }

      // Fallback: Web file input
      fileInputRef.current?.click();
    } catch (error) {
      console.error('[SessionSummary] Error selecting photos:', error);
      setToast({ message: 'Erreur lors de la sélection des photos', type: 'error' });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const newPhotos = files.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
    }));

    setPhotos((prev) => [...prev, ...newPhotos]);
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removePhoto = (index: number) => {
    setPhotos((prev) => {
      const photo = prev[index];
      if (photo.preview.startsWith('blob:')) {
        URL.revokeObjectURL(photo.preview);
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleShare = async () => {
    if (!user) return;

    setSaving(true);
    setUploadingPhotos(true);

    let photoPaths: string[] = [];

    // Upload photos if any (store paths, not URLs)
    if (photos.length > 0) {
      try {
        const uploadPromises = photos.map(async (photo, index) => {
          try {
            // Generate path inline (compatible RLS): must start with userId/
            // Format: ${user.id}/activity/${activityId}/${Date.now()}_${index}.jpg
            const path = `${user.id}/activity/${activityId}/${Date.now()}_${index}.jpg`;
            
            // Verify path starts with userId/
            if (!path.startsWith(`${user.id}/`)) {
              console.error(`[SessionSummary] Invalid photo path: ${path} (must start with ${user.id}/)`);
              return null;
            }

            // Upload using uploadFileToBucket (for File/Blob objects)
            const { objectPath } = await uploadFileToBucket({
              bucket: 'activity-photos',
              path,
              file: photo.file,
            });

            // Return the PATH (not URL) for storage in DB
            return objectPath;
          } catch (error: any) {
            // If one photo fails, continue with others
            console.error(`[SessionSummary] Photo ${index} upload failed:`, {
              error: error?.message || error,
              photoIndex: index,
              userId: user.id,
            });
            return null;
          }
        });

        const paths = await Promise.all(uploadPromises);
        photoPaths = paths.filter((path): path is string => path !== null);

        if (photoPaths.length < photos.length) {
          console.warn(`[SessionSummary] Only ${photoPaths.length}/${photos.length} photos uploaded successfully`);
          setToast({ 
            message: `${photoPaths.length}/${photos.length} photos uploadées avec succès`, 
            type: 'info' 
          });
        } else {
          console.log(`[SessionSummary] All ${photoPaths.length} photos uploaded successfully`);
        }
      } catch (error: any) {
        // Bucket not found or other critical error
        const errorMessage = error?.message || 'Erreur lors de l\'upload';
        console.error('[SessionSummary] Photo upload error:', {
          error: errorMessage,
          userId: user.id,
          activityId,
        });
        
        if (errorMessage.includes('not found')) {
          setToast({ 
            message: 'Le stockage de photos n\'est pas encore configuré. L\'activité sera partagée sans photos.', 
            type: 'error' 
          });
        } else {
          setToast({ 
            message: 'Erreur lors de l\'upload des photos. L\'activité sera partagée sans photos.', 
            type: 'error' 
          });
        }
        // Continue without photos
      }
    }

    setUploadingPhotos(false);

    // UPDATE the existing activity (created in ActiveSession)
    // Store photo PATHS (not URLs) in the photos array
    const updateData: any = {
      notes: notes || null,
      quotes: quotes.length > 0 ? quotes : null,
      visibility: visibility,
      photos: photoPaths.length > 0 ? photoPaths : null,
    };

    console.log('[SessionSummary] Updating activity:', {
      activityId,
      userId: user.id,
      photoPathsCount: photoPaths.length,
      photoPaths: photoPaths.length > 0 ? photoPaths : 'none',
    });

    const { error: updateError } = await supabase
      .from('activities')
      .update(updateData)
      .eq('id', activityId)
      .eq('user_id', user.id); // Extra safety: ensure user owns this activity

    if (updateError) {
      console.error('[SessionSummary] Failed to update activity:', {
        error: updateError.message,
        errorCode: (updateError as any).code,
        errorDetails: (updateError as any).details,
        activityId,
        userId: user.id,
        updateData,
      });
      setToast({ 
        message: 'Erreur lors de la mise à jour de l\'activité', 
        type: 'error' 
      });
      setSaving(false);
      return;
    }

    console.log('[SessionSummary] Activity updated successfully:', {
      activityId,
      photoPathsCount: photoPaths.length,
    });

    // Award XP for reading session
    if (durationMinutes >= 5) {
      const { calculateReadingXp } = await import('../lib/calculateReadingXp');
      const xp = calculateReadingXp(durationMinutes, pagesRead);
      
      if (xp > 0) {
        const { data: xpResult, error: xpError } = await supabase.rpc('award_xp', {
          p_user_id: user.id,
          p_amount: xp,
          p_source: 'reading',
        });

        if (xpError) {
          console.error('[SessionSummary] Error awarding XP:', xpError);
        } else if (xpResult) {
          // Dispatch xp-updated event to refresh UI
          window.dispatchEvent(new CustomEvent('xp-updated', {
            detail: { xp_total: xpResult }
          }));
        }
      }
    }

    // ✅ Notify app to refresh profile/stats (totalMinutes will be recalculated from activities)
    window.dispatchEvent(new Event('activity-created'));

    // Update streak after activity is finalized
    await updateStreakAfterActivity(user.id);

    setSaving(false);
    onComplete();
  };

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  const handleAddNote = async () => {
    if (!user || !noteText.trim()) return;

    const pageNum = parseInt(notePage) || currentPage;

    // Prefix note with tag if selected
    let finalNote = noteText.trim();
    if (noteTag === 'citation') {
      finalNote = `[Citation] ${finalNote}`;
    } else if (noteTag === 'idee') {
      finalNote = `[Idée clé] ${finalNote}`;
    } else if (noteTag === 'question') {
      finalNote = `[Question] ${finalNote}`;
    }

    setSavingNote(true);
    try {
      const { error } = await supabase
        .from('book_notes')
        .insert({
          user_id: user.id,
          book_id: bookId,
          page: pageNum,
          note: finalNote,
          created_from: 'manual',
        });

      if (error) {
        console.error('[SessionSummary] Error saving note:', error);
        setToast({ message: `Erreur: ${error.message}`, type: 'error' });
        return;
      }

      // Reset form
      setNoteText('');
      setNotePage(currentPage.toString());
      setNoteTag(null);
      setShowAddNoteModal(false);

      // Show success toast
      setToast({ message: 'Note ajoutée ✅', type: 'success' });
    } catch (err) {
      console.error('[SessionSummary] Error saving note:', err);
      setToast({ message: `Erreur: ${err instanceof Error ? err.message : String(err)}`, type: 'error' });
    } finally {
      setSavingNote(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-background-light z-50 flex flex-col max-w-md mx-auto h-[100dvh] overflow-hidden">
      {/* Sticky Header with safe-area top */}
      <AppHeader
        title="Partager votre activité"
        showClose
        onClose={handleCancel}
      />

      {/* Scrollable content container */}
      <div 
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-6 py-6"
        style={{
          paddingBottom: 'calc(16px + var(--sab))',
          WebkitOverflowScrolling: 'touch',
          overscrollBehaviorY: 'contain',
          overscrollBehaviorX: 'none',
        }}
      >
        <div className="bg-card-light rounded-2xl p-6 mb-6 border border-gray-200">
          <div className="flex items-start gap-4 mb-4">
            <BookCover
              coverUrl={coverUrl || undefined}
              title={bookTitle}
              author={bookAuthor}
              isbn={bookData?.isbn || null}
              isbn13={bookData?.isbn13 || null}
              isbn10={bookData?.isbn10 || null}
              cover_i={bookData?.openlibrary_cover_id || null}
              openlibrary_cover_id={bookData?.openlibrary_cover_id || null}
              googleCoverUrl={bookData?.google_books_id ? `https://books.google.com/books/content?id=${bookData.google_books_id}&printsec=frontcover&img=1&zoom=1&source=gbs_api` : null}
              className="size-16 rounded-lg shrink-0"
              bookId={bookId}
            />
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-lg leading-tight mb-1">{bookTitle}</h3>
              <p className="text-text-sub-light text-sm">{bookAuthor}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-background-light rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-text-main-light">{pagesRead}</p>
              <p className="text-xs text-text-sub-light font-medium mt-1">Pages</p>
            </div>
            <div className="bg-background-light rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-text-main-light">{formatDuration(durationMinutes)}</p>
              <p className="text-xs text-text-sub-light font-medium mt-1">Durée</p>
            </div>
            <div className="bg-background-light rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-text-main-light">{currentPage}</p>
              <p className="text-xs text-text-sub-light font-medium mt-1">Actuel</p>
            </div>
          </div>

          {pagesRead > 0 && (() => {
            const pages = Math.max(0, pagesRead);
            const mins = Math.max(1, durationMinutes);

            const pph = pages > 0 ? Number((pages / (mins / 60)).toFixed(1)) : null;
            const minPerPageCalc = pages > 0 ? Number((mins / pages).toFixed(1)) : null;

            return (
              <div className="bg-primary/10 rounded-xl p-3 border border-primary/20">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-text-sub-light font-medium">Vitesse :</span>
                  <span className="font-bold text-text-main-light">{pph ? `${pph} pages/h` : '—'}</span>
                </div>
                <div className="flex items-center justify-between text-sm mt-2">
                  <span className="text-text-sub-light font-medium">Allure :</span>
                  <span className="font-bold text-text-main-light">{minPerPageCalc ? `${minPerPageCalc} min/page` : '—'}</span>
                </div>
              </div>
            );
          })()}
        </div>

        <div className="space-y-6">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <label className="block text-sm font-bold text-text-main-light">
                  Note
                </label>
                <span className="text-xs text-text-sub-light">(facultatif)</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setNotePage(currentPage.toString());
                  setNoteText('');
                  setNoteTag(null);
                  setShowAddNoteModal(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-transparent hover:bg-gray-50 transition-colors text-sm font-medium text-text-main-light"
              >
                <Plus className="w-3.5 h-3.5" />
                Ajouter
              </button>
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary resize-none"
              rows={3}
              placeholder="Comment s'est passée votre session de lecture ?"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-text-main-light mb-2 flex items-center gap-2">
              <Quote className="w-4 h-4" />
              Citations (facultatif)
            </label>

            {quotes.length > 0 && (
              <div className="space-y-2 mb-3">
                {quotes.map((quote, index) => (
                  <div
                    key={index}
                    className="bg-card-light border border-gray-200 rounded-xl p-3 relative"
                  >
                    <button
                      onClick={() => removeQuote(index)}
                      className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-full hover:bg-gray-200 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                    <p className="text-sm text-text-main-light pr-6 mb-1 italic">"{quote.text}"</p>
                    <p className="text-xs text-text-sub-light">Page {quote.page}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2">
              <textarea
                value={currentQuote}
                onChange={(e) => setCurrentQuote(e.target.value)}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary resize-none"
                rows={2}
                placeholder="Une citation que vous avez aimée..."
              />
              <div className="flex gap-2">
                <input
                  type="number"
                  value={currentQuotePage}
                  onChange={(e) => setCurrentQuotePage(e.target.value)}
                  className="flex-1 px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  placeholder="Numéro de page"
                  min="1"
                />
                <button
                  onClick={addQuote}
                  disabled={!currentQuote.trim() || !currentQuotePage}
                  className="px-6 py-2 bg-text-main-light text-white rounded-xl font-medium hover:bg-text-main-light/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Ajouter
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-text-main-light mb-2 flex items-center gap-2">
              <Camera className="w-4 h-4" />
              Photos (facultatif)
            </label>
            
            {/* Hidden file input for web fallback */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileChange}
              className="hidden"
            />

            {/* Photo selection button */}
            <button
              type="button"
              onClick={handleSelectPhotos}
              className="w-full h-32 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center hover:border-primary hover:bg-primary/5 transition-colors text-text-sub-light"
            >
              <Camera className="w-8 h-8 mb-2" />
              <span className="text-sm font-medium">Ajouter des photos</span>
              <span className="text-xs mt-1">Caméra ou galerie</span>
            </button>

            {/* Photo previews grid */}
            {photos.length > 0 && (
              <div className="mt-4 grid grid-cols-3 gap-2">
                {photos.map((photo, index) => (
                  <div key={index} className="relative aspect-square rounded-lg overflow-hidden border border-gray-200">
                    <img
                      src={photo.preview}
                      alt={`Photo ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                    {photo.uploading && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                        <div className="text-white text-xs">Upload...</div>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => removePhoto(index)}
                      className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-bold text-text-main-light mb-3">
              Qui peut voir ceci ?
            </label>
            <div className="space-y-2">
              {visibilityOptions.map((option) => {
                const Icon = option.icon;
                return (
                  <button
                    key={option.value}
                    onClick={() => setVisibility(option.value)}
                    className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all ${
                      visibility === option.value
                        ? 'bg-primary/10 border-primary'
                        : 'bg-card-light border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <Icon className={`w-5 h-5 ${visibility === option.value ? 'text-primary' : 'text-text-sub-light'}`} />
                    <div className="flex-1 text-left">
                      <p className="font-bold text-sm">{option.label}</p>
                      <p className="text-xs text-text-sub-light">{option.description}</p>
                    </div>
                    <div
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                        visibility === option.value
                          ? 'border-primary bg-primary'
                          : 'border-gray-300'
                      }`}
                    >
                      {visibility === option.value && (
                        <div className="w-2 h-2 bg-white rounded-full" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="p-6 pt-4 shrink-0 bg-background-light border-t border-gray-200" style={{ paddingBottom: 'calc(16px + var(--sab))' }}>
        <button
          onClick={handleShare}
          disabled={saving || uploadingPhotos}
          className="w-full h-14 flex items-center justify-center rounded-full bg-primary hover:brightness-95 transition-all disabled:opacity-50"
        >
          <span className="text-black text-lg font-bold uppercase tracking-wide">
            {uploadingPhotos ? 'Upload photos...' : saving ? 'Partage...' : 'Partager l\'activité'}
          </span>
        </button>
      </div>

      {/* Modal ajouter note */}
      {showAddNoteModal && (
        <div
          className="fixed inset-0 bg-black/50 z-[200] flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowAddNoteModal(false);
            }
          }}
        >
          <div className="bg-white rounded-2xl max-w-md w-full shadow-xl">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-text-main-light">Ajouter une note</h2>
                <button
                  type="button"
                  onClick={() => setShowAddNoteModal(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-text-main-light mb-2">
                    Page
                  </label>
                  <input
                    type="number"
                    value={notePage}
                    onChange={(e) => setNotePage(e.target.value)}
                    min={0}
                    className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                    placeholder={currentPage.toString()}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-main-light mb-2">
                    Type de note
                  </label>
                  <div className="flex gap-2">
                    {(['citation', 'idee', 'question'] as const).map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => setNoteTag(noteTag === tag ? null : tag)}
                        className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                          noteTag === tag
                            ? 'bg-primary text-black'
                            : 'bg-gray-100 text-text-sub-light hover:bg-gray-200'
                        }`}
                      >
                        {tag === 'citation' ? 'Citation' : tag === 'idee' ? 'Idée clé' : 'Question'}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-main-light mb-2">
                    Note (max 280 caractères)
                  </label>
                  <textarea
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    maxLength={280}
                    rows={3}
                    className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:border-primary focus:ring-1 focus:ring-primary outline-none resize-none"
                    placeholder="Une idée, une citation, un résumé..."
                  />
                  <p className="text-xs text-text-sub-light mt-1 text-right">
                    {noteText.length}/280
                  </p>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddNoteModal(false)}
                    className="flex-1 py-2.5 px-4 rounded-xl bg-gray-100 hover:bg-gray-200 transition-colors text-sm font-medium text-text-main-light"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={handleAddNote}
                    disabled={!noteText.trim() || savingNote}
                    className="flex-1 py-2.5 px-4 rounded-xl bg-primary hover:brightness-95 transition-colors text-sm font-bold text-black disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {savingNote ? 'Enregistrement...' : 'Enregistrer'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
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
