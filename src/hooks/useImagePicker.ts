import { useRef } from 'react';

/**
 * Global ref to track if an image picker is currently open
 * Prevents modal backdrop clicks from closing modals during image selection on iOS
 */
const isPickingRef = { current: false };

/**
 * Timestamp when picker was closed (to block for 1400ms after)
 */
let pickerClosedAt: number | null = null;

/**
 * Hook to manage image picker state globally
 * Prevents modal closure during image selection on iOS
 */
export function useImagePicker() {
  const setIsPicking = (value: boolean) => {
    isPickingRef.current = value;
    if (!value) {
      // When picker closes, record timestamp for 1400ms blocking
      pickerClosedAt = Date.now();
    }
  };

  const isPicking = () => isPickingRef.current;

  /**
   * Check if modal should block close (during picker or 1400ms after)
   */
  const shouldBlockClose = () => {
    if (isPickingRef.current) {
      return true;
    }
    if (pickerClosedAt !== null) {
      const elapsed = Date.now() - pickerClosedAt;
      if (elapsed < 1400) {
        return true;
      }
      // Clear after timeout
      pickerClosedAt = null;
    }
    return false;
  };

  return {
    setIsPicking,
    isPicking,
    isPickingRef,
    shouldBlockClose,
  };
}

