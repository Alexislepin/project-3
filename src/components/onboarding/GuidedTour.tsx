import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type Placement = 'top' | 'bottom' | 'left' | 'right' | 'center';

export interface GuidedStep {
  id: string;
  title: string;
  description: string;
  selector?: string;
  placement?: Placement;
  onEnter?: () => void | Promise<void>;
}

interface GuidedTourProps {
  steps: GuidedStep[];
  open: boolean;
  onClose: () => void;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function GuidedTour({ steps, open, onClose }: GuidedTourProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  // Reset state quand on ferme
  useEffect(() => {
    if (!open) {
      setActiveIndex(0);
      setTargetRect(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  // Run onEnter + measure target whenever the step changes
  useLayoutEffect(() => {
    let cancelled = false;
    let attempts = 0;
    const run = async () => {
      const step = steps[activeIndex];
      if (!step) return;
      if (step.onEnter) {
        await step.onEnter();
        await wait(120); // laisser le DOM se stabiliser
      }
      if (!step.selector) {
        setTargetRect(null);
        return;
      }
      const find = () => document.querySelector(step.selector) as HTMLElement | null;
      let el = find();
      while (!el && attempts < 3) {
        attempts += 1;
        el = find();
      }
      if (cancelled) return;
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
        const rect = el.getBoundingClientRect();
        setTargetRect(rect);
      } else {
        // skip this step if not found
        setTargetRect(null);
        setTimeout(() => setActiveIndex((i) => Math.min(i + 1, steps.length - 1)), 0);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [activeIndex, steps]);

  const step = steps[activeIndex];

  // Style du trou clair (déflouté) autour de la cible
  const holeStyle = useMemo(() => {
    if (!targetRect) return {};
    const holeRadius = Math.max(targetRect.width, targetRect.height) / 2 + 28; // marge autour
    const centerX = targetRect.left + targetRect.width / 2;
    const centerY = targetRect.top + targetRect.height / 2;
    return {
      '--hole-x': `${centerX}px`,
      '--hole-y': `${centerY}px`,
      '--hole-r': `${holeRadius}px`,
      maskImage: `radial-gradient(circle var(--hole-r) at var(--hole-x) var(--hole-y), transparent 0%, transparent 92%, black 95%, black 100%)`,
      WebkitMaskImage: `radial-gradient(circle var(--hole-r) at var(--hole-x) var(--hole-y), transparent 0%, transparent 92%, black 95%, black 100%)`,
    } as React.CSSProperties;
  }, [targetRect]);

  const tooltipPosition = useMemo(() => {
    const viewportW = typeof window !== 'undefined' ? window.innerWidth : 0;
    const viewportH = typeof window !== 'undefined' ? window.innerHeight : 0;
    const tooltipW = Math.min(320, Math.max(200, viewportW - 32)); // largeur responsive
    const tooltipH = 260; // hauteur estimée pour clamp
    const margin = 24;
    const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

    if (!targetRect) {
      return {
        top: `${clamp(viewportH / 2 - tooltipH / 2, margin, Math.max(margin, viewportH - margin - tooltipH))}px`,
        left: `${clamp(viewportW / 2 - tooltipW / 2, margin, Math.max(margin, viewportW - margin - tooltipW))}px`,
        transform: undefined,
        width: `${tooltipW}px`,
      };
    }
    const centerX = targetRect.left + targetRect.width / 2;
    const centerY = targetRect.top + targetRect.height / 2;
    const base = (() => {
      switch (step?.placement) {
        case 'top':
          return {
            top: targetRect.top - margin - tooltipH,
            left: centerX - tooltipW / 2,
            transform: undefined,
          };
        case 'left':
          return {
            top: centerY - tooltipH / 2,
            left: targetRect.left - margin - tooltipW,
            transform: undefined,
          };
        case 'right':
          return {
            top: centerY - tooltipH / 2,
            left: targetRect.right + margin,
            transform: undefined,
          };
        case 'center':
          return {
            top: centerY - tooltipH / 2,
            left: centerX - tooltipW / 2,
            transform: undefined,
          };
        case 'bottom':
        default:
          return {
            top: targetRect.bottom + margin,
            left: centerX - tooltipW / 2,
            transform: undefined,
          };
      }
    })();

    const clampedTop = clamp(
      base.top,
      margin,
      Math.max(margin, viewportH - margin - tooltipH)
    );
    const clampedLeft = clamp(
      base.left,
      margin,
      Math.max(margin, viewportW - margin - tooltipW)
    );

    return {
      top: `${clampedTop}px`,
      left: `${clampedLeft}px`,
      transform: base.transform,
      width: `${tooltipW}px`,
    };
  }, [targetRect, step?.placement]);

  if (!open || !step) return null;

  const total = steps.length;
  const isLast = activeIndex === total - 1;

  const next = () => {
    if (isLast) {
      onClose();
    } else {
      setActiveIndex((i) => Math.min(total - 1, i + 1));
    }
  };

  const prev = () => setActiveIndex((i) => Math.max(0, i - 1));

  // Relancer à la volée si un event global le demande
  useEffect(() => {
    const handler = () => {
      setActiveIndex(0);
      setTargetRect(null);
    };
    window.addEventListener('lexu:restart-tour', handler);
    return () => window.removeEventListener('lexu:restart-tour', handler);
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-[4000] pointer-events-none isolate">
      {/* Overlay simple assombri (pas de blur, pas de cutout) */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'rgba(0,0,0,0.45)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          ...holeStyle,
        }}
      />

      {/* Halo contour + fenêtre nette (désactive le blur à l'intérieur) */}
      {targetRect && (
        <div
          className="absolute pointer-events-none rounded-2xl"
          style={{
            top: `${targetRect.top - 10}px`,
            left: `${targetRect.left - 10}px`,
            width: `${targetRect.width + 20}px`,
            height: `${targetRect.height + 20}px`,
            boxShadow: '0 0 0 2px rgba(255,255,255,0.65)',
            backdropFilter: 'none',
            WebkitBackdropFilter: 'none',
          }}
        />
      )}

      <div
        className="absolute bg-surface p-4 rounded-2xl shadow-2xl border border-white/10 text-text-main-light pointer-events-auto"
        style={tooltipPosition}
      >
        <div className="text-xs uppercase tracking-wide text-text-sub-light mb-2">
          Étape {activeIndex + 1} / {total}
        </div>
        <h3 className="text-lg font-bold mb-2">{step.title}</h3>
        <p className="text-sm text-text-sub-light mb-4">{step.description}</p>
        <div className="flex justify-between items-center gap-2">
          <button
            onClick={onClose}
            className="text-sm text-text-sub-light hover:text-text-main-light transition-colors"
          >
            Passer
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={prev}
              disabled={activeIndex === 0}
              className="px-3 py-2 rounded-lg border border-white/10 text-sm disabled:opacity-40 hover:border-primary/60 transition-colors"
            >
              Précédent
            </button>
            <button
              onClick={next}
              className="px-4 py-2 rounded-lg bg-primary text-black text-sm font-semibold hover:brightness-95 transition-colors"
            >
              {isLast ? 'Terminer' : 'Suivant'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

