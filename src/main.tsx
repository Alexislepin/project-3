import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { SplashScreen } from './components/SplashScreen';
import { DeepLinkGate } from './components/DeepLinkGate';
import App from './App.tsx';
import './i18n';
import { initializeAppLanguage } from './lib/appLanguage';
import './index.css';

// Safe timer management to prevent double-invoke issues
const endedTimers = new Set<string>();

function safeTimeEnd(name: string) {
  if (endedTimers.has(name)) return;
  try { 
    console.timeEnd(name); 
  } catch (e) {
    // Timer doesn't exist, ignore
  }
  endedTimers.add(name);
}

// Instrumentation: Mesurer le temps de boot
if (!(window as any).__appBootStarted) {
  (window as any).__appBootStarted = true;
  console.time('APP_BOOT');
}
console.log('[BOOT] Starting app initialization...');

// Initialize language before rendering (priority: user_profiles > localStorage > navigator > 'fr')
initializeAppLanguage().then(() => {
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    throw new Error('Root element not found');
  }

  createRoot(rootElement).render(
    <StrictMode>
      <SplashScreen>
        <BrowserRouter>
          <DeepLinkGate />
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      </SplashScreen>
    </StrictMode>
  );

  // Marquer le premier render React
  console.log('[BOOT] React root rendered');
  // Use safeTimeEnd to prevent double-invoke issues
  setTimeout(() => safeTimeEnd('APP_BOOT'), 0);
}).catch((error) => {
  console.error('[BOOT] Error initializing app language:', error);
  // Continue anyway with default language
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    throw new Error('Root element not found');
  }

  createRoot(rootElement).render(
    <StrictMode>
      <SplashScreen>
        <BrowserRouter>
          <DeepLinkGate />
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      </SplashScreen>
    </StrictMode>
  );
});
