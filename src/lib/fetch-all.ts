// PostgREST caps every response at the project's max-rows (1000 by default)
// and silently drops the rest — no error, just a short array. Any read whose
// size grows with the event (ledger rows, a fest's results, registrations)
// must page through with .range() instead of trusting one select.
//
// `build(from, to)` returns a fresh query for that window; it must carry a
// deterministic .order() so pages don't overlap or skip rows.

export const PAGE_SIZE = 1000;

type PageResult<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

export async function fetchAll<T>(build: (from: number, to: number) => PageResult<T>): Promise<{ data: T[]; error: string | null }> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build(from, from + PAGE_SIZE - 1);
    if (error) return { data: out, error: error.message };
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) return { data: out, error: null };
  }
}

// `.in(column, ids)` puts every id in the URL; past a few hundred uuids the
// request line gets long enough for proxies to reject it. Chunk the id list
// and run the chunks in parallel.
export async function fetchAllIn<T>(
  ids: string[],
  build: (chunk: string[], from: number, to: number) => PageResult<T>,
  chunkSize = 150,
): Promise<{ data: T[]; error: string | null }> {
  if (ids.length === 0) return { data: [], error: null };
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += chunkSize) chunks.push(ids.slice(i, i + chunkSize));
  const results = await Promise.all(chunks.map((chunk) => fetchAll<T>((from, to) => build(chunk, from, to))));
  const error = results.find((r) => r.error)?.error ?? null;
  return { data: results.flatMap((r) => r.data), error };
}

export function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = map.get(k);
    if (list) list.push(row);
    else map.set(k, [row]);
  }
  return map;
}
