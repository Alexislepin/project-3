import { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { getOneSignalInstance } from '../utils/getOneSignal';

interface OneSignalDebugState {
  platform: string;
  appId: string | null;
  permissionStatus: string | null;
  oneSignalUserId: string | null;
  subscriptionId: string | null;
  pushToken: string | null;
  lastError: string | null;
  isOneSignalAvailable: boolean;
}

export function OneSignalDebug() {
  const [state, setState] = useState<OneSignalDebugState>({
    platform: Capacitor.getPlatform(),
    appId: null,
    permissionStatus: null,
    oneSignalUserId: null,
    subscriptionId: null,
    pushToken: null,
    lastError: null,
    isOneSignalAvailable: false,
  });

  const [loading, setLoading] = useState(true);

  const refreshState = async () => {
    setLoading(true);
    
    const run = async () => {
      const newState: Partial<OneSignalDebugState> = {
        platform: Capacitor.getPlatform(),
        appId: import.meta.env.VITE_ONESIGNAL_APP_ID || null,
        permissionStatus: null,
        oneSignalUserId: null,
        subscriptionId: null,
        pushToken: null,
        lastError: null,
        isOneSignalAvailable: false,
      };

      const OneSignal = getOneSignalInstance();
      
      if (!OneSignal) {
        newState.isOneSignalAvailable = false;
        newState.lastError = 'OneSignal SDK not found';
        setState((s) => ({ ...s, ...newState }));
        setLoading(false);
        return;
      }

      newState.isOneSignalAvailable = true;

      // Get permission status
      try {
        const permStatus = await PushNotifications.checkPermissions();
        newState.permissionStatus = permStatus.receive || 'unknown';
      } catch (err: any) {
        newState.permissionStatus = `Error: ${err?.message || 'Unknown error'}`;
      }

      // Get device state (OneSignal user ID, subscription status)
      try {
        if (typeof OneSignal.getDeviceState === 'function') {
          const deviceState = await OneSignal.getDeviceState();
          newState.oneSignalUserId = deviceState?.userId || null;
          newState.subscriptionId = deviceState?.subscriptionId || null;
          newState.pushToken = deviceState?.pushToken || null;
        } else {
          newState.lastError = 'getDeviceState not available';
        }
      } catch (err: any) {
        newState.lastError = `getDeviceState error: ${err?.message || JSON.stringify(err)}`;
      }

      setState((s) => ({ ...s, ...newState }));
      setLoading(false);
    };

    try {
      await run();
    } catch (error: any) {
      setState((s) => ({
        ...s,
        lastError: `Error: ${error?.message || JSON.stringify(error)}`,
      }));
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshState();
  }, []);

  return (
    <div className="min-h-screen bg-background-light p-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-text-main-light">🔔 OneSignal Debug</h1>
          <button
            onClick={refreshState}
            className="px-4 py-2 bg-primary text-black font-semibold rounded-lg hover:bg-primary/90 transition-colors"
            disabled={loading}
          >
            {loading ? 'Chargement...' : 'Rafraîchir'}
          </button>
        </div>

        <div className="space-y-4">
          {/* Platform */}
          <div className="bg-card-light rounded-xl p-6 border border-gray-200 shadow-sm">
            <h2 className="text-xl font-semibold mb-3 text-text-main-light">Platform</h2>
            <div className="text-sm font-mono bg-gray-50 p-3 rounded border border-gray-200 text-text-main-light">
              {state.platform}
            </div>
          </div>

          {/* OneSignal Availability */}
          <div className="bg-card-light rounded-xl p-6 border border-gray-200 shadow-sm">
            <h2 className="text-xl font-semibold mb-3 text-text-main-light">OneSignal SDK</h2>
            <div className={`text-sm font-mono p-3 rounded border ${
              state.isOneSignalAvailable
                ? 'bg-green-50 border-green-200 text-green-700'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}>
              {state.isOneSignalAvailable ? '✅ Disponible' : '❌ Non disponible'}
            </div>
          </div>

          {/* App ID */}
          <div className="bg-card-light rounded-xl p-6 border border-gray-200 shadow-sm">
            <h2 className="text-xl font-semibold mb-3 text-text-main-light">OneSignal App ID</h2>
            {state.appId ? (
              <div className="text-sm font-mono bg-gray-50 p-3 rounded border border-gray-200 text-text-main-light break-all">
                {state.appId}
              </div>
            ) : (
              <div className="text-sm text-red-600 font-mono bg-red-50 p-3 rounded border border-red-200">
                ❌ VITE_ONESIGNAL_APP_ID non défini
              </div>
            )}
          </div>

          {/* Permission Status */}
          <div className="bg-card-light rounded-xl p-6 border border-gray-200 shadow-sm">
            <h2 className="text-xl font-semibold mb-3 text-text-main-light">Permission Push</h2>
            <div className={`text-sm font-mono p-3 rounded border ${
              state.permissionStatus === 'granted'
                ? 'bg-green-50 border-green-200 text-green-700'
                : state.permissionStatus === 'denied'
                ? 'bg-red-50 border-red-200 text-red-700'
                : 'bg-yellow-50 border-yellow-200 text-yellow-700'
            }`}>
              {state.permissionStatus || 'Non disponible'}
            </div>
          </div>

          {/* OneSignal User ID */}
          <div className="bg-card-light rounded-xl p-6 border border-gray-200 shadow-sm">
            <h2 className="text-xl font-semibold mb-3 text-text-main-light">OneSignal User ID</h2>
            {state.oneSignalUserId ? (
              <div className="text-sm font-mono bg-gray-50 p-3 rounded border border-gray-200 text-text-main-light break-all">
                {state.oneSignalUserId}
              </div>
            ) : (
              <div className="text-sm text-yellow-600 font-mono bg-yellow-50 p-3 rounded border border-yellow-200">
                ⚠️ Non disponible (user pas encore créé)
              </div>
            )}
          </div>

          {/* Subscription ID */}
          <div className="bg-card-light rounded-xl p-6 border border-gray-200 shadow-sm">
            <h2 className="text-xl font-semibold mb-3 text-text-main-light">Subscription ID</h2>
            {state.subscriptionId ? (
              <div className="text-sm font-mono bg-gray-50 p-3 rounded border border-gray-200 text-text-main-light break-all">
                {state.subscriptionId}
              </div>
            ) : (
              <div className="text-sm text-gray-500 font-mono bg-gray-50 p-3 rounded border border-gray-200">
                Non disponible
              </div>
            )}
          </div>

          {/* Push Token */}
          <div className="bg-card-light rounded-xl p-6 border border-gray-200 shadow-sm">
            <h2 className="text-xl font-semibold mb-3 text-text-main-light">Push Token</h2>
            {state.pushToken ? (
              <div className="text-sm font-mono bg-gray-50 p-3 rounded border border-gray-200 text-text-main-light break-all">
                {state.pushToken.substring(0, 50)}...
              </div>
            ) : (
              <div className="text-sm text-gray-500 font-mono bg-gray-50 p-3 rounded border border-gray-200">
                Non disponible
              </div>
            )}
          </div>

          {/* Last Error */}
          {state.lastError && (
            <div className="bg-card-light rounded-xl p-6 border border-gray-200 shadow-sm">
              <h2 className="text-xl font-semibold mb-3 text-text-main-light">Last Error</h2>
              <div className="text-sm font-mono bg-red-50 p-3 rounded border border-red-200 text-red-700 break-all">
                {state.lastError}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

