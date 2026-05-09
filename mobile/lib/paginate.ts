// Paginate a Supabase SELECT past PostgREST's `db.max_rows` cap (default
// 1000). The server caps each response at `max_rows` regardless of the
// client-side `.limit()` value, so collecting larger result sets requires
// repeated `.range(offset, offset + size - 1)` requests.
//
// Usage:
//   const rows = await fetchAllRows<MyRow>(() =>
//     supabase.from('foo').select('id, name').eq('store_id', storeId)
//   );
//
// `buildQuery` returns a fresh PostgrestFilterBuilder per page — needed
// because each call to `.range()` would chain onto the previous and offset
// math would compound. The function calls it per iteration.
//
// Safety: hard-stops at MAX_PAGES (default 200 pages × pageSize = 200k
// rows) to prevent runaway loops on a misconfigured query. MVP catalog
// size is well below this; bump if it becomes a real ceiling.

const DEFAULT_PAGE_SIZE = 1000;
const MAX_PAGES = 200;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QueryBuilder = any;

export async function fetchAllRows<T>(
  buildQuery: () => QueryBuilder,
  pageSize: number = DEFAULT_PAGE_SIZE,
): Promise<T[]> {
  const all: T[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const offset = page * pageSize;
    const { data, error } = await buildQuery().range(offset, offset + pageSize - 1);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    all.push(...rows);
    if (rows.length < pageSize) return all;
  }
  // Reached MAX_PAGES without a short page — partial result is more useful
  // than throwing, but log so the limit can be raised intentionally.
  // eslint-disable-next-line no-console
  console.warn(`fetchAllRows hit MAX_PAGES (${MAX_PAGES}); result may be truncated`);
  return all;
}
