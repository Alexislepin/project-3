/**
 * Utility functions for normalizing reading state
 */

export type BookStatus = 'reading' | 'completed' | 'want_to_read';

export interface ReadingStateInput {
  status: BookStatus;
  total_pages: number | null;
  current_page: number | null;
}

export interface ReadingStateOutput {
  status: BookStatus;
  total_pages: number | null;
  current_page: number;
  started_at: string | null;
  completed_at: string | null;
}

/**
 * Normalize reading state based on status and rules
 * 
 * Rules:
 * - want_to_read: current_page = 0, completed_at = null
 * - reading: current_page >= 1 (required), started_at set if not already set
 * - completed: current_page = total_pages, completed_at = now()
 */
export function normalizeReadingState(input: ReadingStateInput): ReadingStateOutput {
  const { status, total_pages, current_page } = input;
  
  let finalCurrentPage: number;
  let startedAt: string | null = null;
  let completedAt: string | null = null;

  switch (status) {
    case 'want_to_read':
      finalCurrentPage = 0;
      completedAt = null;
      break;

    case 'reading':
      // For reading, current_page must be at least 1
      finalCurrentPage = current_page !== null && current_page > 0 ? current_page : 1;
      startedAt = new Date().toISOString();
      completedAt = null;
      break;

    case 'completed':
      // For completed, current_page should equal total_pages
      finalCurrentPage = total_pages !== null && total_pages > 0 ? total_pages : (current_page || 0);
      completedAt = new Date().toISOString();
      // Set started_at if not provided (assume they started when they completed if unknown)
      startedAt = null; // Can be set separately if needed
      break;

    default:
      finalCurrentPage = 0;
  }

  // Validate: if both total_pages and current_page are set, current_page should not exceed total_pages
  if (total_pages !== null && total_pages > 0 && finalCurrentPage > total_pages) {
    // Clamp to total_pages for safety
    finalCurrentPage = total_pages;
  }

  return {
    status,
    total_pages,
    current_page: finalCurrentPage,
    started_at: startedAt,
    completed_at: completedAt,
  };
}

