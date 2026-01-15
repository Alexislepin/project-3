import { useEffect, useState, useRef } from "react";
import { Home, BookOpen, TrendingUp, User, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SpeedDial } from "../SpeedDial";

type View = "home" | "search" | "library" | "profile" | "insights" | "social";

type BottomNavProps = {
  currentView: View;
  onNavigate: (view: View) => void;
  onStartSession: () => void;

  // ✅ Nouveaux callbacks (optionnels)
  onOpenScanner?: () => void;
};

export function BottomNav({
  currentView,
  onNavigate,
  onStartSession,
  onOpenScanner,
}: BottomNavProps) {
  const { t } = useTranslation();
  const [isFabOpen, setIsFabOpen] = useState(false);
  const fabRef = useRef<HTMLButtonElement>(null);
  const [fabPosition, setFabPosition] = useState({ bottom: 0, left: 0 });
  const [modalOpen, setModalOpen] = useState(false);
  const [activeSessionOpen, setActiveSessionOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);

  // ✅ Lire document.body.dataset.modalOpen et data-activeSession pour désactiver/masquer la tabbar
  useEffect(() => {
    const checkModalOpen = () => {
      const isModalOpen = document.body.dataset.modalOpen === '1';
      const isActiveSession = document.body.dataset.activeSession === '1';
      const isScanner = document.body.dataset.scannerOpen === '1';
      setModalOpen(isModalOpen);
      setActiveSessionOpen(isActiveSession);
      setScannerOpen(isScanner);
    };

    // Check initial
    checkModalOpen();

    // Observer pour détecter les changements
    const observer = new MutationObserver(checkModalOpen);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['data-modal-open', 'data-active-session', 'data-scanner-open'],
    });

    return () => observer.disconnect();
  }, []);

  // Calculer la position du FAB pour le SpeedDial
  useEffect(() => {
    if (isFabOpen && fabRef.current) {
      const rect = fabRef.current.getBoundingClientRect();
      // bottom = distance depuis le bas de la fenêtre jusqu'au HAUT du FAB (pour placer le menu au-dessus)
      // On utilise rect.top pour avoir le haut du FAB
      setFabPosition({
        bottom: window.innerHeight - rect.top,
        left: rect.left + rect.width / 2,
      });
    }
  }, [isFabOpen]);

  // Si session active : ne rien rendre (cacher tabbar + FAB)
  if (activeSessionOpen || scannerOpen) {
    return null;
  }

  const handleFabClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsFabOpen((v) => !v);
  };

  const handleScanner = () => {
    if (onOpenScanner) {
      onOpenScanner();
    } else {
      // fallback si tu n'as rien branché
      onNavigate("library");
      window.dispatchEvent(new CustomEvent("lexu:open-scanner"));
    }
  };

  const TABBAR_HEIGHT = 64; // h-16 = 64px
  const FAB_SIZE = 68; // 68px - FAB plus gros et plus présent
  const FAB_RADIUS = FAB_SIZE / 2; // 34px

  // Calcul exact : le CENTRE du FAB doit être sur le top de la BottomNav
  // bottom = env(safe-area-inset-bottom) + TABBAR_HEIGHT - (FAB_SIZE / 2)
  // bottom = env(safe-area-inset-bottom) + 64 - 34 = env(safe-area-inset-bottom) + 30

  return (
    <>
      {/* SpeedDial avec Portal */}
      <SpeedDial
        open={isFabOpen}
        onClose={() => setIsFabOpen(false)}
        onScan={handleScanner}
        onStartSession={onStartSession}
        fabPosition={fabPosition}
      />

      {/* ✅ FAB flottant - positionné en fixed par rapport au viewport */}
      <button
        ref={fabRef}
        onClick={handleFabClick}
        aria-expanded={isFabOpen}
        aria-label={isFabOpen ? "Fermer" : "Ouvrir le menu"}
        data-tour-target="fab-speed-dial"
        className={`fixed rounded-full bg-primary border-4 border-white flex items-center justify-center active:scale-95 transition-all ${
          isFabOpen ? "animate-pulse-glow" : ""
        }`}
        style={{
          left: "50vw",
          width: `${FAB_SIZE}px`,
          height: `${FAB_SIZE}px`,
          bottom: `calc(env(safe-area-inset-bottom) + ${TABBAR_HEIGHT}px - ${FAB_RADIUS}px)`,
          transform: "translateX(-50%)",
          boxShadow: "0 6px 28px rgba(249, 245, 6, 0.5)",
          pointerEvents: modalOpen ? 'none' : 'auto',
          zIndex: isFabOpen ? 2147483647 : 1200,
        }}
      >
        {isFabOpen ? (
          <X
            className="w-7 h-7 transition-transform duration-300"
            style={{ color: '#000' }}
          />
        ) : (
          <div
            className="w-7 h-7 rounded-full"
            style={{ backgroundColor: "rgba(53, 57, 29, 1)" }}
          />
        )}
      </button>

      {/* ✅ Tabbar - wrapper avec safe-area */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-[1000] bg-white border-t border-black/5 overflow-visible"
        style={{
          height: "calc(var(--tabbar-h) + env(safe-area-inset-bottom))",
          paddingBottom: "env(safe-area-inset-bottom)",
          pointerEvents: modalOpen ? 'none' : 'auto',
        }}
      >
        {/* Inner bar avec les 4 onglets */}
        <div className="relative max-w-2xl mx-auto h-16 flex items-center justify-between px-6">
          {/* Home */}
          <button
            onClick={() => onNavigate("home")}
            data-tour-target="nav-home"
            className={`flex flex-col items-center gap-1 text-xs ${
              currentView === "home" ? "text-black font-semibold" : "text-black/50"
            }`}
          >
            <Home className="w-5 h-5" />
            {t('nav.home')}
          </button>

          {/* Stats/Insights */}
          <button
            onClick={() => onNavigate("insights")}
            data-tour-target="nav-insights"
            className={`flex flex-col items-center gap-1 text-xs ${
              currentView === "insights" ? "text-black font-semibold" : "text-black/50"
            }`}
          >
            <TrendingUp className="w-5 h-5" />
            {t('nav.stats')}
          </button>

          {/* Espace vide au centre pour le FAB (ne pas rendre de bouton ici) */}
          <div className="w-16" />

          {/* Library */}
          <button
            onClick={() => onNavigate("library")}
            data-tour-target="nav-library"
            className={`flex flex-col items-center gap-1 text-xs ${
              currentView === "library" ? "text-black font-semibold" : "text-black/50"
            }`}
          >
            <BookOpen className="w-5 h-5" />
            {t('nav.library')}
          </button>

          {/* Profile */}
          <button
            onClick={() => onNavigate("profile")}
            data-tour-target="nav-profile"
            className={`flex flex-col items-center gap-1 text-xs ${
              currentView === "profile" ? "text-black font-semibold" : "text-black/50"
            }`}
          >
            <User className="w-5 h-5" />
            {t('nav.profile')}
          </button>
        </div>
      </nav>
    </>
  );
}
