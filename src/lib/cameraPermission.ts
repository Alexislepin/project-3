import { Capacitor } from '@capacitor/core';
import { Camera } from '@capacitor/camera';

export async function requestCameraPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) {
    // Web: utiliser l'API navigator
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach(track => track.stop());
      return true;
    } catch (error) {
      return false;
    }
  }

  // iOS/Android: utiliser Capacitor Camera
  try {
    const status = await Camera.checkPermissions();
    if (status.camera === 'granted') {
      return true;
    }
    
    const result = await Camera.requestPermissions();
    return result.camera === 'granted';
  } catch (error) {
    console.error('Error requesting camera permission:', error);
    return false;
  }
}

export async function openSettings(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      // Utiliser window.location pour ouvrir les réglages iOS (app-settings:)
      // Cette méthode fonctionne dans WKWebView Capacitor
      if (Capacitor.getPlatform() === 'ios') {
        window.location.href = 'app-settings:';
      } else {
        // Android: utiliser l'intent
        window.location.href = 'android.settings.APPLICATION_DETAILS_SETTINGS';
      }
    } catch (error) {
      console.error('Error opening settings:', error);
      // Fallback: afficher un message à l'utilisateur
      alert('Allez dans Réglages iPhone > Lexu > Caméra pour autoriser l\'accès à la caméra.');
    }
  } else {
    // Web: afficher un message
    alert('Allez dans les paramètres de votre navigateur pour autoriser l\'accès à la caméra.');
  }
}

