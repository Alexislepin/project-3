import React from 'react';
import { X } from 'lucide-react';

interface TutorialOverlayProps {
  step: number;
  totalSteps: number;
  title: string;
  description: string;
  onNext: () => void;
  onSkip: () => void;
  highlightSelector?: string; // CSS selector for element to highlight
  position?: 'top' | 'bottom' | 'center' | 'custom';
  customPosition?: { top?: number; left?: number; right?: number; bottom?: number };
}

/**
 * Tutorial Overlay Component
 * 
 * Displays a semi-transparent overlay with:
 * - Optional element highlight (via CSS selector)
 * - Title and description text
 * - "J'ai compris" button
 * - Skip button
 * - Step indicator
 */
export function TutorialOverlay({
  step,
  totalSteps,
  title,
  description,
  onNext,
  onSkip,
  highlightSelector,
  position = 'bottom',
  customPosition,
}: TutorialOverlayProps) {
  // Get highlight element position if selector provided
  const [highlightRect, setHighlightRect] = React.useState<DOMRect | null>(null);

  React.useEffect(() => {
    if (!highlightSelector) {
      setHighlightRect(null);
      return;
    }

    const updateHighlight = () => {
      const element = document.querySelector(highlightSelector);
      if (element) {
        const rect = element.getBoundingClientRect();
        setHighlightRect(rect);
      } else {
        setHighlightRect(null);
      }
    };

    // Initial update
    updateHighlight();

    // Update on scroll/resize
    window.addEventListener('scroll', updateHighlight, true);
    window.addEventListener('resize', updateHighlight);

    // Also try after a short delay (for dynamic content)
    const timeout = setTimeout(updateHighlight, 100);

    return () => {
      window.removeEventListener('scroll', updateHighlight, true);
      window.removeEventListener('resize', updateHighlight);
      clearTimeout(timeout);
    };
  }, [highlightSelector]);

  // Calculate tooltip position
  const getTooltipStyle = (): React.CSSProperties => {
    if (customPosition) {
      return {
        position: 'fixed',
        ...customPosition,
      };
    }

    if (highlightRect) {
      // Position tooltip relative to highlighted element
      switch (position) {
        case 'top':
          return {
            position: 'fixed',
            bottom: window.innerHeight - highlightRect.top + 16,
            left: '50%',
            transform: 'translateX(-50%)',
            maxWidth: '90%',
          };
        case 'bottom':
          return {
            position: 'fixed',
            top: highlightRect.bottom + 16,
            left: '50%',
            transform: 'translateX(-50%)',
            maxWidth: '90%',
          };
        case 'center':
          return {
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            maxWidth: '90%',
          };
        default:
          return {
            position: 'fixed',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            maxWidth: '90%',
          };
      }
    }

    // Default position (no highlight)
    switch (position) {
      case 'top':
        return {
          position: 'fixed',
          top: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          maxWidth: '90%',
        };
      case 'center':
        return {
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          maxWidth: '90%',
        };
      default:
        return {
          position: 'fixed',
          bottom: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          maxWidth: '90%',
        };
    }
  };

  return (
    <>
      {/* Semi-transparent overlay */}
    <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9998]"
        onClick={(e) => {
          // Don't close on overlay click - require explicit button click
          e.stopPropagation();
        }}
      />

      {/* Highlight cutout (if element is highlighted) */}
      {highlightRect && (
        <div
          className="fixed z-[9999] pointer-events-none"
          style={{
            top: highlightRect.top - 4,
            left: highlightRect.left - 4,
            width: highlightRect.width + 8,
            height: highlightRect.height + 8,
            borderRadius: 12,
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.6), 0 0 0 4px rgba(59, 130, 246, 0.8)',
          }}
        />
      )}

      {/* Tooltip */}
      <div
        className="fixed z-[10000] max-w-md mx-4"
        style={getTooltipStyle()}
      >
        <div className="bg-white rounded-2xl shadow-2xl p-6 border border-stone-200">
          {/* Header */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold text-stone-500 uppercase tracking-wide">
                  Étape {step} / {totalSteps}
                </span>
              </div>
              <h3 className="text-lg font-bold text-stone-900">{title}</h3>
            </div>
            <button
              onClick={onSkip}
              className="ml-4 p-1 hover:bg-stone-100 rounded-full transition-colors flex-shrink-0"
              aria-label="Passer le didacticiel"
            >
              <X className="w-5 h-5 text-stone-500" />
            </button>
          </div>

          {/* Description */}
          <p className="text-sm text-stone-600 mb-4 leading-relaxed">{description}</p>

          {/* Actions */}
          <div className="flex items-center justify-between gap-3">
            <button
              onClick={onSkip}
              className="text-sm text-stone-500 hover:text-stone-700 font-medium"
            >
              Passer
            </button>
            <button
              onClick={onNext}
              className="flex-1 bg-stone-900 hover:bg-stone-800 text-white font-semibold py-2.5 px-4 rounded-lg transition-colors"
            >
              J'ai compris
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

