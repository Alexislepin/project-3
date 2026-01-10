import { useEffect, useState } from 'react';
import { X, Bell, BellOff, Clock, Target } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface NotificationSettingsModalProps {
  onClose: () => void;
}

export function NotificationSettingsModal({ onClose }: NotificationSettingsModalProps) {
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [goalReminderEnabled, setGoalReminderEnabled] = useState(true);
  const [notificationTime, setNotificationTime] = useState('20:00');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [browserSupported, setBrowserSupported] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    loadSettings();
    checkNotificationSupport();
  }, [user]);

  const checkNotificationSupport = () => {
    if ('Notification' in window) {
      setBrowserSupported(true);
      setPermissionGranted(Notification.permission === 'granted');
    }
  };

  const loadSettings = async () => {
    if (!user) return;

    const { data } = await supabase
      .from('user_profiles')
      .select('notifications_enabled, notification_time, goal_reminder_enabled')
      .eq('id', user.id)
      .maybeSingle();

    if (data) {
      setNotificationsEnabled(data.notifications_enabled || false);
      setGoalReminderEnabled(data.goal_reminder_enabled !== false);
      if (data.notification_time) {
        setNotificationTime(data.notification_time);
      }
    }

    setLoading(false);
  };

  const requestNotificationPermission = async () => {
    if (!browserSupported) return;

    try {
      const permission = await Notification.requestPermission();
      setPermissionGranted(permission === 'granted');

      if (permission === 'granted') {
        setNotificationsEnabled(true);
        await saveSettings(true, goalReminderEnabled, notificationTime);

        new Notification('Notifications activées !', {
          body: 'Vous recevrez des rappels pour vos objectifs de lecture',
          icon: '/image.png',
        });
      }
    } catch (error) {
      console.error('Error requesting notification permission:', error);
    }
  };

  const saveSettings = async (enabled?: boolean, goalReminder?: boolean, time?: string) => {
    if (!user) return;

    setSaving(true);

    const updates = {
      notifications_enabled: enabled !== undefined ? enabled : notificationsEnabled,
      goal_reminder_enabled: goalReminder !== undefined ? goalReminder : goalReminderEnabled,
      notification_time: time !== undefined ? time : notificationTime,
    };

    const { error } = await supabase
      .from('user_profiles')
      .update(updates)
      .eq('id', user.id);

    setSaving(false);
  };

  const handleToggleNotifications = async () => {
    const newValue = !notificationsEnabled;
    setNotificationsEnabled(newValue);
    await saveSettings(newValue, goalReminderEnabled, notificationTime);

    if (newValue === true && user?.id) {
      // NOTE: Push notifications registration is now centralized in registerPush.ts
      // and should only be called once after user authentication
      // Permissions are requested automatically during OneSignal initialization
      
      new Notification('Notifications activées !', {
        body: 'Vous recevrez des rappels pour vos objectifs de lecture',
        icon: '/image.png',
      });
    }
  };

  const handleToggleGoalReminder = async () => {
    const newValue = !goalReminderEnabled;
    setGoalReminderEnabled(newValue);
    await saveSettings(notificationsEnabled, newValue, notificationTime);
  };

  const handleTimeChange = async (newTime: string) => {
    setNotificationTime(newTime);
    await saveSettings(notificationsEnabled, goalReminderEnabled, newTime);
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end justify-center z-50" onClick={onClose}>
        <div
          className="bg-white rounded-t-3xl max-w-2xl w-full max-h-[85vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-center py-12">
            <div className="text-text-sub-light">Chargement...</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-t-3xl max-w-2xl w-full max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-shrink-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-3xl">
          <h2 className="text-xl font-bold">Paramètres de notifications</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0" style={{ WebkitOverflowScrolling: 'touch' }}>
          <div className="space-y-6 p-6" style={{ paddingBottom: 'calc(3rem + env(safe-area-inset-bottom) + 32px)' }}>
            {!browserSupported && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <p className="text-sm text-amber-800">
                  Votre navigateur ne supporte pas les notifications. Veuillez utiliser un navigateur moderne.
                </p>
              </div>
            )}

            {!permissionGranted ? (
              <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-6">
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-12 h-12 bg-amber-200 rounded-full flex items-center justify-center flex-shrink-0">
                    <Bell className="w-6 h-6 text-amber-800" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-lg mb-1 text-amber-900">Autorisation requise</h3>
                    <p className="text-sm text-amber-800">
                      Pour activer les notifications, vous devez d'abord autoriser votre navigateur à afficher des notifications.
                    </p>
                  </div>
                </div>
                <button
                  onClick={requestNotificationPermission}
                  disabled={saving}
                  className="w-full bg-amber-600 text-white py-3 px-4 rounded-xl font-medium hover:bg-amber-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Bell className="w-5 h-5" />
                  Autoriser les notifications
                </button>
              </div>
            ) : (
              <div className="bg-card-light rounded-xl border border-gray-200 p-5">
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
                    notificationsEnabled ? 'bg-primary' : 'bg-gray-200'
                  }`}>
                    {notificationsEnabled ? (
                      <Bell className="w-6 h-6 text-black" />
                    ) : (
                      <BellOff className="w-6 h-6 text-gray-500" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <h3 className="font-bold text-lg mb-1">Notifications</h3>
                        <p className="text-sm text-text-sub-light">
                          Activez les notifications pour recevoir des rappels
                        </p>
                      </div>
                      <button
                        onClick={handleToggleNotifications}
                        disabled={saving || !browserSupported}
                        className={`relative w-14 h-8 rounded-full transition-colors ${
                          notificationsEnabled ? 'bg-primary' : 'bg-gray-300'
                        } ${!browserSupported ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <div
                          className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-transform ${
                            notificationsEnabled ? 'translate-x-6' : ''
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {permissionGranted && notificationsEnabled && (
              <>
                <div className="bg-card-light rounded-xl border border-gray-200 p-5">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <Target className="w-6 h-6 text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <h3 className="font-bold text-lg mb-1">Rappels d'objectifs</h3>
                          <p className="text-sm text-text-sub-light">
                            Recevez des rappels pour compléter vos objectifs quotidiens
                          </p>
                        </div>
                        <button
                          onClick={handleToggleGoalReminder}
                          disabled={saving}
                          className={`relative w-14 h-8 rounded-full transition-colors ${
                            goalReminderEnabled ? 'bg-primary' : 'bg-gray-300'
                          }`}
                        >
                          <div
                            className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-transform ${
                              goalReminderEnabled ? 'translate-x-6' : ''
                            }`}
                          />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {goalReminderEnabled && (
                  <div className="bg-card-light rounded-xl border border-gray-200 p-5">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <Clock className="w-6 h-6 text-purple-600" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-bold text-lg mb-1">Heure du rappel</h3>
                        <p className="text-sm text-text-sub-light mb-4">
                          Choisissez l'heure à laquelle vous souhaitez recevoir vos rappels quotidiens
                        </p>
                        <div className="flex items-center gap-3">
                          <input
                            type="time"
                            value={notificationTime}
                            onChange={(e) => handleTimeChange(e.target.value)}
                            disabled={saving}
                            className="flex-1 px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary font-medium text-lg"
                          />
                        </div>
                        <p className="text-xs text-text-sub-light mt-3">
                          Vous recevrez un rappel tous les jours à cette heure si vous n'avez pas encore complété vos objectifs
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <p className="text-sm text-blue-800 mb-2 font-medium">
                Comment fonctionnent les notifications ?
              </p>
              <ul className="text-xs text-blue-700 space-y-1.5">
                <li>• Vous recevrez un rappel quotidien à l'heure choisie</li>
                <li>• Les rappels sont envoyés uniquement si vous n'avez pas atteint vos objectifs</li>
                <li>• Vous pouvez désactiver les notifications à tout moment</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
