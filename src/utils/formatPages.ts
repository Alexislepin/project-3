/**
 * Format pages count for display
 * - If < 8000: display as integer (e.g., 200)
 * - If >= 8000: display in "k" format (e.g., 8k, 12.5k)
 * - Never display "0.2k" or similar for small numbers
 */
export function formatPagesCount(pages?: number | null): string {
  const n = typeof pages === 'number' && isFinite(pages) ? Math.max(0, Math.floor(pages)) : 0;

  if (n < 8000) return String(n);

  const k = n / 1000;
  const rounded = Math.round(k * 10) / 10; // 1 décimale
  // Enlever .0 si entier
  return (Number.isInteger(rounded) ? String(Math.trunc(rounded)) : String(rounded)) + 'k';
}

