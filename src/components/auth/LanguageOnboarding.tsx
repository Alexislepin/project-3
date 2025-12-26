import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { setAppLanguage } from '../../lib/appLanguage';

interface LanguageOnboardingProps {
  onComplete: () => void;
}

export function LanguageOnboarding({ onComplete }: LanguageOnboardingProps) {
  const { t } = useTranslation();
  const [selectedLang, setSelectedLang] = useState<'fr' | 'en'>('fr');
  const [saving, setSaving] = useState(false);

  const handleLanguageSelect = async (lang: 'fr' | 'en') => {
    setSelectedLang(lang);
    setSaving(true);

    try {
      // Use centralized function (single source of truth)
      await setAppLanguage(lang);

      // Complete onboarding
      onComplete();
    } catch (error) {
      console.error('[LanguageOnboarding] Error saving language:', error);
      // Still continue even if save fails
      onComplete();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background-light flex items-center justify-center p-6">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-text-primary mb-2">
            {selectedLang === 'fr' ? 'Choisissez votre langue' : 'Choose your language'}
          </h1>
          <p className="text-text-sub-light">
            {selectedLang === 'fr' 
              ? 'Sélectionnez la langue de l\'interface' 
              : 'Select the interface language'}
          </p>
        </div>

        <div className="space-y-4">
          <button
            onClick={() => handleLanguageSelect('fr')}
            disabled={saving}
            className={`w-full p-6 rounded-2xl border-2 transition-all ${
              selectedLang === 'fr'
                ? 'border-primary bg-primary/10'
                : 'border-gray-200 bg-white hover:border-gray-300'
            } ${saving ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <div className="text-2xl font-semibold text-text-primary mb-1">
              Français
            </div>
            <div className="text-sm text-text-sub-light">
              French
            </div>
          </button>

          <button
            onClick={() => handleLanguageSelect('en')}
            disabled={saving}
            className={`w-full p-6 rounded-2xl border-2 transition-all ${
              selectedLang === 'en'
                ? 'border-primary bg-primary/10'
                : 'border-gray-200 bg-white hover:border-gray-300'
            } ${saving ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <div className="text-2xl font-semibold text-text-primary mb-1">
              English
            </div>
            <div className="text-sm text-text-sub-light">
              Anglais
            </div>
          </button>
        </div>

        {saving && (
          <div className="mt-6 text-center text-text-sub-light">
            {selectedLang === 'fr' ? 'Chargement...' : 'Loading...'}
          </div>
        )}
      </div>
    </div>
  );
}

