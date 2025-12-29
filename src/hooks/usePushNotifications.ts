/**
 * React Hook for Push Notifications
 * 
 * Usage:
 * const { register, isRegistered, error } = usePushNotifications();
 * 
 * useEffect(() => {
 *   register();
 * }, []);
 */

import { useState, useEffect, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import {
  registerForPushNotifications,
  setupPushNotificationListeners,
  handleNotificationNavigation,
  PushNotificationData,
} from '../lib/pushNotifications';
import { useAuth } from '../contexts/AuthContext';

export function usePushNotifications() {
  const [isRegistered, setIsRegistered] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  const register = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) {
      setError('Push notifications only work on native platforms');
      return;
    }

    if (!user) {
      setError('User must be logged in');
      return;
    }

    try {
      setError(null);
      const deviceToken = await registerForPushNotifications();
      
      if (deviceToken) {
        setToken(deviceToken);
        setIsRegistered(true);
      } else {
        setError('Failed to register for push notifications');
      }
    } catch (err: any) {
      setError(err.message || 'Unknown error');
    }
  }, [user]);

  // Setup listeners when registered
  useEffect(() => {
    if (!isRegistered || !Capacitor.isNativePlatform()) {
      return;
    }

    const cleanup = setupPushNotificationListeners((data: PushNotificationData) => {
      console.log('Notification received:', data);
      
      // Handle navigation
      handleNotificationNavigation(data);
      
      // You can also trigger a refresh of notifications list here
      // For example, if you have a notifications context:
      // refreshNotifications();
    });

    return cleanup;
  }, [isRegistered]);

  return {
    register,
    isRegistered,
    token,
    error,
  };
}

