import { useRef } from 'react';

/**
 * Global ref to track if an image picker is currently open
 * Prevents modal backdrop clicks from closing modals during image selection on iOS
 */
const isPickingRef = { current: false };

/**
 * Hook to manage image picker state globally
 * Prevents modal closure during image selection on iOS
 */
export function useImagePicker() {
  const setIsPicking = (value: boolean) => {
    isPickingRef.current = value;
  };

  const isPicking = () => isPickingRef.current;

  return {
    setIsPicking,
    isPicking,
    isPickingRef,
  };
}

