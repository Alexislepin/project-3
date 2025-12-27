import { supabase } from './supabase';

/**
 * Helper to count rows in a Supabase table with exact count
 * Uses head: true to avoid fetching all rows
 * Uses select('*', ...) to work with tables that don't have an 'id' column
 * 
 * @param table - Table name
 * @param build - Function that builds the query with filters
 * @returns Exact count of matching rows
 */
export async function countRows(
  table: string,
  build: (q: any) => any
): Promise<number> {
  const q = build(
    supabase
      .from(table)
      .select('*', { count: 'exact', head: true })
  );

  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

