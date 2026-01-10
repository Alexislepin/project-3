import { useState, useEffect } from 'react';
import { AppHeader } from './AppHeader';
import { HelpCircle, Mail, Shield, Bug, ArrowRight, ChevronDown } from 'lucide-react';

interface HelpCenterModalProps {
  open: boolean;
  onClose: () => void;
  onOpenScanner?: () => void;
  onOpenXpInfo?: () => void;
  onOpenManualAdd?: () => void;
  initialView?: View;
}

type View = 'home' | 'faq' | 'privacy' | 'bug';

interface FAQItem {
  question: string;
  answer: string;
}

// FAQ data
const FAQ_DATA: FAQItem[] = [
  {
    question: 'Comment scanner mon livre ?',
    answer: 'Appuie sur le gros bouton en bas au centre, puis choisis Scanner. Place le code-barres dans le cadre.',
  },
  {
    question: 'Mon livre n’est pas trouvé avec le code-barres',
    answer: 'Réessaie une deuxième fois : certains codes-barres sont difficiles à lire. Si ça ne marche pas, ajoute-le manuellement.',
  },
  {
    question: 'Comment ajouter un livre manuellement ?',
    answer: 'Va dans Bibliothèque > Ajouter, puis remplis Titre, Auteur et Pages.',
  },
  {
    question: 'Comment augmenter ses XP ?',
    answer: 'Tu gagnes de l’XP quand tu ajoutes une activité de lecture (pages + minutes). Lis régulièrement pour faire monter ton niveau.',
  },
  {
    question: 'Pourquoi mes XP n’augmentent pas ?',
    answer: 'Vérifie que ton activité contient bien des pages et une durée. Si l’XP ne bouge pas, ferme et rouvre l’app.',
  },
  {
    question: 'Comment fonctionne la série (flammes) ?',
    answer: 'Ta série augmente si tu lis chaque jour. Si tu ne lis pas un jour, la série retombe à 0.',
  },
  {
    question: 'Je ne vois pas ma couverture / ma photo',
    answer: 'Sur iOS, certaines autorisations peuvent bloquer l’accès aux images. Réessaie après avoir relancé l’app.',
  },
];

export function HelpCenterModal({
  open,
  onClose,
  onOpenScanner,
  onOpenXpInfo,
  onOpenManualAdd,
  initialView = 'home',
}: HelpCenterModalProps) {
  const [view, setView] = useState<View>(initialView);
  const [openFAQIndex, setOpenFAQIndex] = useState<number | null>(null);

  // Reset view when modal opens/closes or initialView changes
  useEffect(() => {
    if (open) {
      setView(initialView);
    }
  }, [open, initialView]);

  if (!open) return null;

  const toggleFAQ = (index: number) => {
    setOpenFAQIndex(openFAQIndex === index ? null : index);
  };

  const renderHome = () => (
    <div className="px-4 py-6 space-y-4">
      <div
        onClick={() => setView('faq')}
        className="flex items-center justify-between p-4 bg-card-light rounded-xl border border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 rounded-lg">
            <HelpCircle className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="font-semibold text-text-main-light">Aide (FAQ)</h3>
            <p className="text-sm text-text-sub-light">Questions fréquentes</p>
          </div>
        </div>
        <ArrowRight className="w-5 h-5 text-text-sub-light" />
      </div>

      <div
        onClick={() => setView('privacy')}
        className="flex items-center justify-between p-4 bg-card-light rounded-xl border border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-green-50 rounded-lg">
            <Shield className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h3 className="font-semibold text-text-main-light">Confidentialité</h3>
            <p className="text-sm text-text-sub-light">Données et vie privée</p>
          </div>
        </div>
        <ArrowRight className="w-5 h-5 text-text-sub-light" />
      </div>

      <div
        onClick={() => setView('bug')}
        className="flex items-center justify-between p-4 bg-card-light rounded-xl border border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-red-50 rounded-lg">
            <Bug className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h3 className="font-semibold text-text-main-light">Signaler un bug</h3>
            <p className="text-sm text-text-sub-light">Problème technique ?</p>
          </div>
        </div>
        <ArrowRight className="w-5 h-5 text-text-sub-light" />
      </div>
    </div>
  );

  const renderFAQ = () => (
    <div className="px-4 py-6 space-y-3">
      {FAQ_DATA.map((item, index) => {
        const isOpen = openFAQIndex === index;
        return (
          <div
            key={index}
            className="bg-card-light rounded-xl border border-gray-200 overflow-hidden"
          >
            <button
              onClick={() => toggleFAQ(index)}
              className="w-full p-4 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
            >
              <h3 className="font-semibold text-text-main-light pr-4 flex-1">{item.question}</h3>
              <ChevronDown
                className={`w-5 h-5 text-text-sub-light flex-shrink-0 transition-transform ${
                  isOpen ? 'transform rotate-180' : ''
                }`}
              />
            </button>
            {isOpen && (
              <div className="px-4 pb-4">
                <p className="text-sm text-text-sub-light leading-relaxed">{item.answer}</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  const renderPrivacy = () => (
    <div className="px-4 py-6 space-y-4">
      <div className="p-4 bg-card-light rounded-xl border border-gray-200">
        <h3 className="font-semibold text-text-main-light mb-3">Données stockées</h3>
        <p className="text-sm text-text-sub-light leading-relaxed mb-4">
          Nous stockons les données suivantes pour faire fonctionner l'application :
        </p>
        <ul className="text-sm text-text-sub-light space-y-2 mb-4 list-disc list-inside">
          <li>Profil utilisateur (nom, avatar, bio)</li>
          <li>Livres ajoutés à ta bibliothèque</li>
          <li>Activités de lecture (pages, durée)</li>
          <li>Likes et commentaires sur les livres</li>
          <li>Relations sociales (followers, following)</li>
        </ul>
        <p className="text-sm text-text-sub-light leading-relaxed mb-4">
          Ces données sont stockées de manière sécurisée sur nos serveurs et ne sont jamais vendues à des tiers.
        </p>
      </div>

      <div className="p-4 bg-card-light rounded-xl border border-gray-200">
        <h3 className="font-semibold text-text-main-light mb-3">Suppression du compte</h3>
        <p className="text-sm text-text-sub-light leading-relaxed mb-4">
          Tu peux demander la suppression de ton compte et de toutes tes données à tout moment.
        </p>
        <p className="text-sm text-text-sub-light leading-relaxed">
          Pour cela, contacte-nous à :{' '}
          <a
            href="mailto:contact@lexuappbeta.com?subject=Suppression de compte"
            className="text-primary underline"
          >
            contact@lexuappbeta.com
          </a>
        </p>
      </div>

      <div className="p-4 bg-card-light rounded-xl border border-gray-200">
        <h3 className="font-semibold text-text-main-light mb-3">Contact</h3>
        <p className="text-sm text-text-sub-light leading-relaxed">
          Pour toute question sur la confidentialité, écris-nous à :{' '}
          <a
            href="mailto:contact@lexuappbeta.com?subject=Question confidentialité"
            className="text-primary underline"
          >
            contact@lexuappbeta.com
          </a>
        </p>
      </div>
    </div>
  );

  const renderBug = () => {
    const deviceModel = navigator.userAgent.includes('iPhone') ? 'iPhone' : 'Appareil';
    const appVersion = '1.0.0'; // TODO: Get from package.json or env
    const subject = encodeURIComponent('[Lexu] Bug report');
    const body = encodeURIComponent(
      `Modèle: ${deviceModel}\nVersion app: ${appVersion}\n\nCe que j'ai fait:\n\nCe que j'attendais:\n\nCe qui s'est passé:\n\nCapture écran: (joindre si possible)`
    );
    const mailtoLink = `mailto:contact@lexuappbeta.com?subject=${subject}&body=${body}`;

    return (
      <div className="px-4 py-6 space-y-4">
        <div className="p-4 bg-card-light rounded-xl border border-gray-200">
          <h3 className="font-semibold text-text-main-light mb-3">Signaler un bug</h3>
          <p className="text-sm text-text-sub-light leading-relaxed mb-4">
            Si tu rencontres un problème technique, n'hésite pas à nous le signaler. Plus tu donnes de détails, plus on pourra le corriger rapidement.
          </p>
          <p className="text-sm text-text-sub-light leading-relaxed mb-4">
            Un email va s'ouvrir avec un modèle pré-rempli. Ajoute les informations demandées et envoie-le nous.
          </p>
          <a
            href={mailtoLink}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-black rounded-xl font-medium hover:brightness-95 transition-colors"
          >
            <Mail className="w-4 h-4" />
            Ouvrir l'email
          </a>
        </div>
      </div>
    );
  };

  const getTitle = () => {
    switch (view) {
      case 'faq':
        return 'Aide (FAQ)';
      case 'privacy':
        return 'Confidentialité';
      case 'bug':
        return 'Signaler un bug';
      default:
        return 'Centre d\'aide';
    }
  };

  const handleBack = () => {
    if (view === 'home') {
      onClose();
    } else {
      setView('home');
    }
  };

  return (
    <div className="fixed inset-0 bg-background-light z-[200] overflow-y-auto">
      <div className="max-w-2xl mx-auto">
        <AppHeader
          title={getTitle()}
          showBack
          onBack={handleBack}
        />
        <div className="min-h-screen pb-20">
          {view === 'home' && renderHome()}
          {view === 'faq' && renderFAQ()}
          {view === 'privacy' && renderPrivacy()}
          {view === 'bug' && renderBug()}
        </div>
      </div>
    </div>
  );
}

