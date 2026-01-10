import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Scan, Play } from "lucide-react";

interface SpeedDialProps {
  open: boolean;
  onClose: () => void;
  onScan: () => void;
  onStartSession: () => void;
  fabPosition: {
    bottom: number;
    left: number;
  };
}

export function SpeedDial({ open, onClose, onScan, onStartSession, fabPosition }: SpeedDialProps) {
  // ESC ferme
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // Bloque scroll derrière
  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [open]);

  const handleOverlayClick = () => {
    onClose();
  };

  const handleScanClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClose();
    onScan();
  };

  const handleStartSessionClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClose();
    onStartSession();
  };

  if (!open) return null;

  // constants
  const BUTTON_SIZE = 50;
  const BUTTON_OFFSET_X = 44;
  const BUTTON_OFFSET_Y = 52;

  // ⚠️ adapte si ta tabbar est plus haute
  const TABBAR_H = 88; // mets 88 pour être safe (iOS + labels)
  const EXTRA_MARGIN = 12;

  // bottom "naturel" au-dessus du FAB
  const naturalBottom = fabPosition.bottom + BUTTON_OFFSET_Y;

  // clamp au-dessus de la tabbar (sans safe-area)
  const clamped = Math.max(naturalBottom, TABBAR_H + EXTRA_MARGIN);

  // ✅ on ajoute le safe-area iOS DIRECTEMENT en CSS
  const bottomCss = `calc(${clamped}px + env(safe-area-inset-bottom))`;

  const centerX = fabPosition.left;
  const leftButtonX = centerX - BUTTON_OFFSET_X;
  const rightButtonX = centerX + BUTTON_OFFSET_X;

  // z-index "nucléaire"
  const Z = 2147483647;

  return createPortal(
    <>
      <button
        aria-label="Fermer le menu"
        className="fixed inset-0 bg-transparent transition-opacity duration-300"
        onClick={handleOverlayClick}
        style={{
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          zIndex: Z - 1,
        }}
      />

      <button
        onClick={handleScanClick}
        className="fixed rounded-full bg-primary border-2 border-white shadow-[0_3px_16px_rgba(249,245,6,0.25)] flex items-center justify-center active:scale-95 transition-all pointer-events-auto"
        style={{
          width: `${BUTTON_SIZE}px`,
          height: `${BUTTON_SIZE}px`,
          bottom: bottomCss,
          left: `${leftButtonX}px`,
          transform: "translateX(-50%)",
          animation: open ? "fadeInScaleUp 0.18s ease-out" : "none",
          zIndex: Z,
        }}
        aria-label="Scanner un livre"
      >
        <Scan className="w-5 h-5 text-black" />
      </button>

      <button
        onClick={handleStartSessionClick}
        className="fixed rounded-full bg-primary border-2 border-white shadow-[0_3px_16px_rgba(249,245,6,0.25)] flex items-center justify-center active:scale-95 transition-all pointer-events-auto"
        style={{
          width: `${BUTTON_SIZE}px`,
          height: `${BUTTON_SIZE}px`,
          bottom: bottomCss,
          left: `${rightButtonX}px`,
          transform: "translateX(-50%)",
          animation: open ? "fadeInScaleUp 0.18s ease-out" : "none",
          zIndex: Z,
        }}
        aria-label="Commencer une activité"
      >
        <Play className="w-5 h-5 text-black" />
      </button>

      <style>{`
        @keyframes fadeInScaleUp {
          from { opacity: 0; transform: translateX(-50%) translateY(4px) scale(0.9); }
          to { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
        }
      `}</style>
    </>,
    document.body
  );
}

