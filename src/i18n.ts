import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import fr from './locales/fr.json';
import en from './locales/en.json';

// Get initial language from localStorage (will be overridden by initializeAppLanguage if user is connected)
const getInitialLanguage = (): string => {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('lexu_lang');
    if (stored === 'fr' || stored === 'en') {
      return stored;
    }
  }
  return 'fr'; // Default to French
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      fr: { translation: fr },
      en: { translation: en },
    },
    lng: getInitialLanguage(),
    fallbackLng: 'fr',
    interpolation: {
      escapeValue: false, // React already escapes
    },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'lexu_lang',
      caches: ['localStorage'],
    },
  });

export default i18n;

