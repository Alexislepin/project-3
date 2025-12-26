import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getCurrentLang } from '../lib/appLanguage';

interface LanguageSelectorModalProps {
  currentLang?: 'fr' | 'en'; // Optional, will be read from getCurrentLang() if not provided
  onClose: () => void;
  onLanguageChange: (lang: 'fr' | 'en') => void;
}

export function LanguageSelectorModal({ onClose, onLanguageChange }: Omit<LanguageSelectorModalProps, 'currentLang'>) {
  const { t } = useTranslation();
  // Get current language from single source of truth
  const currentLang = getCurrentLang();

  return (
    <div
      className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-background-light rounded-3xl w-full max-w-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-background-light/95 backdrop-blur-sm z-10 px-6 pt-4 pb-3 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-text-main-light">
              {currentLang === 'fr' ? 'Choisir la langue' : 'Choose language'}
            </h2>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
              aria-label={t('common.close')}
            >
              <X className="w-5 h-5 text-text-sub-light" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-3">
          <button
            onClick={() => onLanguageChange('fr')}
            className={`w-full p-4 rounded-xl border-2 transition-all text-left ${
              currentLang === 'fr'
                ? 'border-primary bg-primary/10'
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <div className="text-lg font-semibold text-text-primary mb-1">
              Français
            </div>
            <div className="text-sm text-text-sub-light">
              French
            </div>
          </button>

          <button
            onClick={() => onLanguageChange('en')}
            className={`w-full p-4 rounded-xl border-2 transition-all text-left ${
              currentLang === 'en'
                ? 'border-primary bg-primary/10'
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <div className="text-lg font-semibold text-text-primary mb-1">
              English
            </div>
            <div className="text-sm text-text-sub-light">
              Anglais
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

