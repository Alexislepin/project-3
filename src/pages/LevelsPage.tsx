import { AppHeader } from '../components/AppHeader';

export function LevelsPage() {
  return (
    <div className="h-screen max-w-2xl mx-auto bg-background-light overflow-hidden">
      <AppHeader title="Niveaux & XP" showBack onBack={() => { window.location.href = '/profile'; }} />
      
      <div className="h-full overflow-y-auto" style={{ paddingBottom: 'calc(64px + env(safe-area-inset-bottom))' }}>
        <div className="px-4 pt-6 pb-8">
          <div className="space-y-4 text-stone-700">
            <p className="text-base leading-relaxed">
              Tu gagnes de l'XP en lisant et en étant actif.
            </p>
            <p className="text-base leading-relaxed">
              Chaque niveau demande plus d'XP.
            </p>
            <p className="text-base leading-relaxed">
              Ton niveau reflète ta progression sur Lexu.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

