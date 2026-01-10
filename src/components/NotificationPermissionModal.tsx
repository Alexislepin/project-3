import { useState } from 'react';
import { X, Bell, Settings } from 'lucide-react';
import { openNotificationSettings } from '../notifications/askPushPermission';
import { ensurePushPermission } from '../notifications/ensurePushPermission';
import { Capacitor } from '@capacitor/core';

interface NotificationPermissionModalProps {
  onClose: () => void;
  onGranted?: () => void;
}

export function NotificationPermissionModal({ onClose, onGranted }: NotificationPermissionModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleEnableNotif = async () => {
    if (!Capacitor.isNativePlatform()) {
      // On web, just close
      onGranted?.();
      onClose();
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // ÉTAPE 1: Forcer UNE FOIS la permission iOS (OBLIGATOIRE)
      // Via un clic utilisateur (bouton), pas au boot
      console.log('[ONESIGNAL] 🔵 Requesting permission via user gesture...');
      
      // Ensure push permission (displays iOS popup and triggers APNs registration)
      const granted = await ensurePushPermission();

      if (granted === true) {
        console.log('✅ Notifs activées');
        onGranted?.();
        onClose();
        return;
      }

      // Si refusé → CTA vers Réglages
      setError('Les notifications ont été refusées. Vous pouvez les activer dans les réglages de l\'app.');
    } catch (err: any) {
      console.error('Error requesting notification permission:', err);
      setError('Une erreur est survenue lors de la demande de permission.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenSettings = async () => {
    try {
      await openNotificationSettings();
    } catch (err: any) {
      console.error('Error opening settings:', err);
      setError('Impossible d\'ouvrir les réglages.');
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
              <Bell className="w-6 h-6 text-primary" />
            </div>
            <h2 className="text-2xl font-bold text-text-main-light">Activer les notifications</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors"
            aria-label="Fermer"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-4">
          <p className="text-text-sub-light">
            Active les notifications pour recevoir des rappels sur tes objectifs de lecture et être notifié des nouvelles activités de tes amis.
          </p>

          <div className="bg-gray-50 rounded-xl p-4 space-y-2">
            <div className="flex items-start gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2" />
              <p className="text-sm text-text-sub-light">
                Rappels pour tes objectifs quotidiens
              </p>
            </div>
            <div className="flex items-start gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2" />
              <p className="text-sm text-text-sub-light">
                Notifications quand quelqu'un aime ou commente tes activités
              </p>
            </div>
            <div className="flex items-start gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2" />
              <p className="text-sm text-text-sub-light">
                Alertes pour tes nouveaux followers
              </p>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <button
            onClick={handleEnableNotif}
            disabled={loading}
            className="w-full py-4 rounded-xl bg-primary text-black font-bold text-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-5 h-5 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                <span>Activation...</span>
              </>
            ) : (
              <>
                <Bell className="w-5 h-5" />
                <span>Activer les notifications</span>
              </>
            )}
          </button>

          {error && !loading && (
            <button
              onClick={handleOpenSettings}
              className="w-full py-3 rounded-xl bg-gray-100 text-text-main-light font-semibold hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
            >
              <Settings className="w-4 h-4" />
              <span>Ouvrir les réglages</span>
            </button>
          )}

          <button
            onClick={onClose}
            className="w-full py-2 text-text-sub-light text-sm hover:text-text-main-light transition-colors"
          >
            Plus tard
          </button>
        </div>
      </div>
    </div>
  );
}

