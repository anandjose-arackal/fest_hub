"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

// Tiny stale-while-revalidate cache for the portal's reference data (fests,
// shakhas, the org hierarchy, org settings). Several components on one page
// ask for the same data (the side nav and the page both list fests), and
// every page change used to refetch it from scratch. With this:
//   • concurrent callers share one in-flight request;
//   • a remount shows the last data instantly and refreshes it in the
//     background once it is older than `staleMs`.

interface Entry {
  data?: unknown;
  at: number; // when `data` landed (0 = never)
  promise?: Promise<unknown>;
}

const store = new Map<string, Entry>();
const listeners = new Map<string, Set<() => void>>();

function emit(key: string) {
  listeners.get(key)?.forEach((l) => l());
}

function entry(key: string): Entry {
  let e = store.get(key);
  if (!e) {
    e = { at: 0 };
    store.set(key, e);
  }
  return e;
}

export function fetchCached<T>(key: string, fetcher: () => Promise<T>, staleMs: number, force = false): Promise<T> {
  const e = entry(key);
  if (e.promise) return e.promise as Promise<T>;
  if (!force && e.at > 0 && Date.now() - e.at < staleMs) return Promise.resolve(e.data as T);
  const p = fetcher()
    .then((data) => {
      e.data = data;
      e.at = Date.now();
      return data;
    })
    .catch((err) => {
      // Settle "loading" on failure too (keeping any older data); the next
      // reader past staleMs retries.
      e.at = Date.now();
      throw err;
    })
    .finally(() => {
      e.promise = undefined;
      emit(key);
    });
  e.promise = p;
  emit(key);
  return p;
}

// Drops a key so the next reader fetches fresh (e.g. after an admin edit).
export function invalidateCached(key: string) {
  const e = store.get(key);
  if (!e) return;
  e.at = 0;
  emit(key);
}

const EMPTY = Object.freeze({ data: undefined, at: 0, fetching: false });
const snapshots = new Map<string, { data: unknown; at: number; fetching: boolean }>();

function snapshot(key: string) {
  const e = store.get(key);
  if (!e) return EMPTY;
  const prev = snapshots.get(key);
  const fetching = !!e.promise;
  if (prev && prev.data === e.data && prev.at === e.at && prev.fetching === fetching) return prev;
  const next = { data: e.data, at: e.at, fetching };
  snapshots.set(key, next);
  return next;
}

export function useCachedQuery<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  { staleMs, pollMs }: { staleMs: number; pollMs?: number | null },
): { data: T | undefined; loading: boolean; refresh: () => Promise<T> | undefined } {
  const subscribe = useCallback(
    (cb: () => void) => {
      if (!key) return () => {};
      let set = listeners.get(key);
      if (!set) {
        set = new Set();
        listeners.set(key, set);
      }
      set.add(cb);
      return () => set!.delete(cb);
    },
    [key],
  );
  const snap = useSyncExternalStore(
    subscribe,
    () => (key ? snapshot(key) : EMPTY),
    () => EMPTY,
  );

  // `fetcher` is intentionally not a dependency: callers pass an inline
  // closure, and the key already identifies what it fetches.
  useEffect(() => {
    if (!key) return;
    fetchCached(key, fetcher, staleMs).catch((e) => console.error(`[cache:${key}]`, e));
    if (!pollMs) return;
    const id = setInterval(() => {
      fetchCached(key, fetcher, 0, true).catch((e) => console.error(`[cache:${key}] poll`, e));
    }, pollMs);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, staleMs, pollMs]);

  const refresh = useCallback(() => (key ? fetchCached(key, fetcher, 0, true) : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key]);

  return {
    data: snap.data as T | undefined,
    loading: !!key && snap.at === 0,
    refresh,
  };
}
