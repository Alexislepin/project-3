import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { SplashScreen } from './components/SplashScreen';
import App from './App.tsx';
import './i18n';
import { initializeAppLanguage } from './lib/appLanguage';
import './index.css';

// Instrumentation: Mesurer le temps de boot
console.time('APP_BOOT');
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
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      </SplashScreen>
    </StrictMode>
  );

  // Marquer le premier render React
  console.log('[BOOT] React root rendered');
  console.timeEnd('APP_BOOT');
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
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      </SplashScreen>
    </StrictMode>
  );
});
