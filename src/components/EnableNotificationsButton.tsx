import { useState, useEffect } from 'react';
import { Bell, Settings } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { initializeOneSignalOnce } from '../notifications/initOneSignal';
import { waitForDeviceReadyAndOneSignal } from '../utils/onesignal';
import { ensurePushPermission } from '../notifications/ensurePushPermission';

interface EnableNotificationsButtonProps {
  onGranted?: () => void;
  className?: string;
  variant?: 'primary' | 'secondary';
}

export function EnableNotificationsButton({ 
  onGranted, 
  className = '',
  variant = 'primary'
}: EnableNotificationsButtonProps) {
  const [loading, setLoading] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<'unknown' | 'granted' | 'denied' | 'prompt'>('unknown');
  const [error, setError] = useState<string | null>(null);

  // Check current permission status on mount
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      setPermissionStatus('granted');
      return;
    }

    checkPermissionStatus();
  }, []);

  const checkPermissionStatus = async () => {
    try {
      await initializeOneSignalOnce();
      const OneSignal = await waitForDeviceReadyAndOneSignal();
      
      if (!OneSignal?.Notifications) {
        setPermissionStatus('unknown');
        return;
      }

      // Check current permission
      let current: boolean | undefined;
      
      if (typeof OneSignal.Notifications.getPermission === 'function') {
        current = await OneSignal.Notifications.getPermission();
      } else if (typeof OneSignal.Notifications.permissionNative === 'boolean') {
        current = OneSignal.Notifications.permissionNative;
      } else if (typeof (OneSignal.Notifications as any)._permission === 'boolean') {
        current = (OneSignal.Notifications as any)._permission;
      } else {
        current = false;
      }

      console.log('[EnableNotificationsButton] Current permission status:', current);
      
      if (current === true) {
        setPermissionStatus('granted');
      } else {
        setPermissionStatus('denied');
      }
    } catch (err: any) {
      console.error('[EnableNotificationsButton] Error checking permission:', err);
      setPermissionStatus('unknown');
    }
  };

  const handleRequestPermission = async () => {
    if (!Capacitor.isNativePlatform()) {
      onGranted?.();
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log('[EnableNotificationsButton] 🔵 Requesting permission via user gesture...');
      
      // Ensure OneSignal is initialized
      await initializeOneSignalOnce();
      const OneSignal = await waitForDeviceReadyAndOneSignal();
      
      if (!OneSignal?.Notifications) {
        console.error('[EnableNotificationsButton] Notifications API not available');
        setError('OneSignal n\'est pas disponible');
        setLoading(false);
        return;
      }

      // Check current permission before requesting
      let before: boolean | undefined;
      if (typeof OneSignal.Notifications.getPermission === 'function') {
        before = await OneSignal.Notifications.getPermission();
      } else if (typeof OneSignal.Notifications.permissionNative === 'boolean') {
        before = OneSignal.Notifications.permissionNative;
      } else if (typeof (OneSignal.Notifications as any)._permission === 'boolean') {
        before = (OneSignal.Notifications as any)._permission;
      }
      
      console.log('[EnableNotificationsButton] Permission status BEFORE request:', before);

      // Force request permission (OBLIGATOIRE - via user gesture)
      const granted = await OneSignal.Notifications.requestPermission(true);
      
      console.log('[EnableNotificationsButton] Permission request result:', granted);

      // Re-check permission after request
      let after: boolean | undefined;
      if (typeof OneSignal.Notifications.getPermission === 'function') {
        after = await OneSignal.Notifications.getPermission();
      } else if (typeof OneSignal.Notifications.permissionNative === 'boolean') {
        after = OneSignal.Notifications.permissionNative;
      } else if (typeof (OneSignal.Notifications as any)._permission === 'boolean') {
        after = (OneSignal.Notifications as any)._permission;
      } else {
        after = Boolean(granted);
      }

      const finalGranted = Boolean(after);
      console.log('[EnableNotificationsButton] Permission status AFTER request:', { granted, after, finalGranted });

      if (finalGranted) {
        setPermissionStatus('granted');
        
        // Ensure push permission (displays iOS popup and triggers APNs registration)
        await ensurePushPermission();
        
        onGranted?.();
      } else {
        setPermissionStatus('denied');
        setError('Permission refusée');
      }
    } catch (err: any) {
      console.error('[EnableNotificationsButton] Error requesting permission:', {
        error: err,
        errorString: JSON.stringify(err),
        message: err?.message,
        stack: err?.stack,
      });
      setError('Erreur lors de la demande de permission');
      setPermissionStatus('denied');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenSettings = async () => {
    try {
      console.log('[EnableNotificationsButton] 🔵 Opening notification settings...');
      await App.openUrl({ url: 'app-settings:' });
      console.log('[EnableNotificationsButton] ✅ Settings opened');
    } catch (err: any) {
      console.error('[EnableNotificationsButton] Error opening settings:', {
        error: err,
        errorString: JSON.stringify(err),
        message: err?.message,
      });
      setError('Impossible d\'ouvrir les réglages');
    }
  };

  if (permissionStatus === 'granted') {
    return (
      <div className={`flex items-center gap-2 text-green-600 ${className}`}>
        <Bell className="w-5 h-5" />
        <span className="text-sm font-medium">Notifications activées</span>
      </div>
    );
  }

  if (permissionStatus === 'denied' && !loading) {
    return (
      <button
        onClick={handleOpenSettings}
        className={`flex items-center gap-2 px-4 py-2 rounded-xl font-semibold transition-colors ${
          variant === 'primary'
            ? 'bg-gray-100 text-text-main-light hover:bg-gray-200'
            : 'bg-primary text-black hover:bg-primary/90'
        } ${className}`}
      >
        <Settings className="w-5 h-5" />
        <span>Ouvrir les réglages</span>
      </button>
    );
  }

  return (
    <button
      onClick={handleRequestPermission}
      disabled={loading}
      className={`flex items-center gap-2 px-4 py-2 rounded-xl font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
        variant === 'primary'
          ? 'bg-primary text-black hover:bg-primary/90'
          : 'bg-gray-100 text-text-main-light hover:bg-gray-200'
      } ${className}`}
    >
      {loading ? (
        <>
          <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
          <span>Activation...</span>
        </>
      ) : (
        <>
          <Bell className="w-5 h-5" />
          <span>Activer les notifications</span>
        </>
      )}
    </button>
  );
}

