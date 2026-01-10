import { useRef } from 'react';

/**
 * Global ref to track if an image picker is currently open
 * Prevents modal backdrop clicks from closing modals during image selection on iOS
 */
const isPickingRef = { current: false };

/**
 * Timestamp when picker was closed (to block for 2000ms after on iOS)
 */
let pickerClosedAt: number | null = null;

/**
 * Hook to manage image picker state globally
 * Prevents modal closure during image selection on iOS
 * 
 * RULE: isPickingImage === true → NO modal closure allowed
 */
export function useImagePicker() {
  const setIsPicking = (value: boolean) => {
    isPickingRef.current = value;
    if (!value) {
      // When picker closes, record timestamp for 2000ms blocking (iOS needs more time)
      pickerClosedAt = Date.now();
    }
  };

  const isPicking = () => isPickingRef.current;

  /**
   * Check if modal should block close (during picker or 2000ms after)
   * 
   * CRITICAL: This must be checked in ALL modal close handlers
   */
  const shouldBlockClose = () => {
    if (isPickingRef.current) {
      return true; // Picker is active - BLOCK
    }
    if (pickerClosedAt !== null) {
      const elapsed = Date.now() - pickerClosedAt;
      if (elapsed < 2000) {
        return true; // Just closed - BLOCK for 2s
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

