/**
 * Layout constants for fixed header and bottom navigation
 * These values are used consistently across all pages to ensure proper scroll behavior
 */

// Header height: py-3 (12px top + 12px bottom = 24px) + content (~32px) = 56px
export const HEADER_HEIGHT = 56;

// Tabbar content height: h-16 = 64px (fixed)
// The nav also has paddingBottom: env(safe-area-inset-bottom) which is variable per device
export const TABBAR_HEIGHT = 64;

// Additional padding at the end of scrollable content (for visual spacing)
export const SCROLL_END_PADDING = 12;

/**
 * Calculate the top padding/margin for scrollable content
 * Includes header height + safe area inset top
 */
export function getScrollTopOffset(): string {
  return `calc(${HEADER_HEIGHT}px + env(safe-area-inset-top))`;
}

/**
 * Calculate the bottom padding for scrollable content
 * Includes tabbar height + safe area inset bottom + end padding
 */
export function getScrollBottomPadding(): string {
  return `calc(${TABBAR_HEIGHT}px + env(safe-area-inset-bottom) + ${SCROLL_END_PADDING}px)`;
}

