import { useCallback, useEffect, useRef, useState } from "react";
import { readCache, writeCache } from "../lib/cache";
import {
  fetchEvents,
  fetchProfiles,
  fetchQuotes,
  fetchSignals,
  supabase,
  type EarningsEvent,
  type Group,
  type Profile,
  type Quote,
  type SharedItem,
  type SharedList,
  type Signals,
  type WatchItem,
} from "../lib/supabase";

const REFRESH_MS = 60_000;
/** Beim Zurückkehren in den Tab neu laden (geteilte Listen ändern andere), höchstens alle 30 s */
const REVISIT_MS = 30_000;

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

type Snapshot = {
  allowed: boolean;
  items: WatchItem[];
  groups: Group[];
  admin?: boolean;
  sharedLists?: SharedList[];
  sharedItems?: SharedItem[];
  quotes: Record<string, Quote>;
  profiles: Record<string, Profile>;
  events?: Record<string, EarningsEvent>;
  signals?: Record<string, Signals>;
  updated: string | null;
};

/**
 * Daten der Watchlist: zeigt sofort den letzten Stand aus dem Browser-Cache, lädt im Hintergrund
 * Liste, Logos, Termine, Signale und Kurse nach und aktualisiert die Kurse jede Minute.
 */
export function useWatchlistData(userId: string) {
  // Letzten Stand sofort zeigen, frische Daten kommen im Hintergrund
  const [cached] = useState(() => readCache<Snapshot>(`snap2:${userId}`));
  const [allowed, setAllowed] = useState<boolean | null>(
    cached?.allowed ?? null,
  );
  const [items, setItems] = useState<WatchItem[] | null>(cached?.items ?? null);
  const [groups, setGroups] = useState<Group[]>(cached?.groups ?? []);
  const [admin, setAdmin] = useState(cached?.admin ?? false);
  const [sharedLists, setSharedLists] = useState<SharedList[]>(
    cached?.sharedLists ?? [],
  );
  const [sharedItems, setSharedItems] = useState<SharedItem[]>(
    cached?.sharedItems ?? [],
  );
  const [quotes, setQuotes] = useState<Record<string, Quote>>(
    cached?.quotes ?? {},
  );
  const [profiles, setProfiles] = useState<Record<string, Profile>>(
    cached?.profiles ?? {},
  );
  const [events, setEvents] = useState<Record<string, EarningsEvent>>(
    cached?.events ?? {},
  );
  const [signals, setSignals] = useState<Record<string, Signals>>(
    cached?.signals ?? {},
  );
  const [error, setError] = useState<string | null>(null);
  const lastLoad = useRef(0);
  // Läuft gerade eine Aktualisierung? Dann zeigt die Oberfläche den letzten Stand dezent als „alt“ an.
  const [pending, setPending] = useState(0);
  const refreshing = pending > 0;
  const [updated, setUpdated] = useState<Date | null>(
    cached?.updated ? new Date(cached.updated) : null,
  );

  useEffect(() => {
    if (allowed === null || items === null) return;
    writeCache(`snap2:${userId}`, {
      allowed,
      items,
      groups,
      admin,
      sharedLists,
      sharedItems,
      quotes,
      profiles,
      events,
      signals,
      updated: updated?.toISOString() ?? null,
    } satisfies Snapshot);
  }, [userId, allowed, items, groups, admin, sharedLists, sharedItems, quotes, profiles, events, signals, updated]);

  const loadQuotes = useCallback(async (symbols: string[]) => {
    if (symbols.length === 0) return;
    setPending((n) => n + 1);
    try {
      const qs = await fetchQuotes(symbols);
      setQuotes((old) => ({
        ...old,
        ...Object.fromEntries(qs.map((q) => [q.symbol, q])),
      }));
      setUpdated(new Date());
      setError(null);
    } catch {
      setError("Kurse konnten nicht geladen werden.");
    } finally {
      setPending((n) => n - 1);
    }
  }, []);

  const loadAllInner = useCallback(async () => {
    lastLoad.current = Date.now();
    const [it, gr, sl, si] = await Promise.all([
      supabase
        .from("watchlist_items")
        .select("id, symbol, name, group_id, position")
        .order("position"),
      supabase
        .from("watchlist_groups")
        .select("id, name, position, collapsed")
        .order("position"),
      supabase
        .from("shared_lists")
        .select("id, name, owner_id, owner_name, members:shared_list_members(email)")
        .order("created_at"),
      supabase
        .from("shared_list_items")
        .select("id, list_id, symbol, name, added_by, added_by_name, position")
        .order("position"),
    ]);
    if (it.error || gr.error) {
      setError("Watchlist konnte nicht geladen werden.");
      setItems((old) => old ?? []);
      return;
    }
    // Unveränderte Liste nicht neu setzen, sonst zeichnet sich alles ohne Grund neu
    setItems((old) => (same(old, it.data) ? old : it.data));
    setGroups((old) => (same(old, gr.data) ? old : gr.data));
    // Geteilte Listen sind Zusatz: Fehler dort lassen die eigene Liste stehen
    if (!sl.error && !si.error) {
      setSharedLists((old) => (same(old, sl.data) ? old : sl.data));
      setSharedItems((old) => (same(old, si.data) ? old : si.data));
    }
    const symbols = uniqueSymbols(it.data, si.data ?? []);
    // Logos/Namen und Kurse parallel; Logos sind Zierde, Fehler dort stören nicht
    await Promise.all([
      fetchProfiles(symbols)
        .then((ps) =>
          setProfiles((old) => ({
            ...old,
            ...Object.fromEntries(ps.map((p) => [p.symbol, p])),
          })),
        )
        .catch(() => {}),
      // Quartalstermine sind Zusatz; ohne sie bleibt die Liste vollständig
      fetchEvents(symbols)
        .then((es) =>
          setEvents((old) => ({
            ...old,
            ...Object.fromEntries(es.map((e) => [e.symbol, e])),
          })),
        )
        .catch(() => {}),
      // Analysten-Signale ebenso Zusatz (12 h gecacht, fehlende kommen schrittweise nach)
      fetchSignals(symbols)
        .then((ss) =>
          setSignals((old) => ({
            ...old,
            ...Object.fromEntries(ss.map((x) => [x.symbol, x])),
          })),
        )
        .catch(() => {}),
      loadQuotes(symbols),
    ]);
  }, [loadQuotes]);

  const loadAll = useCallback(async () => {
    setPending((n) => n + 1);
    try {
      await loadAllInner();
    } finally {
      setPending((n) => n - 1);
    }
  }, [loadAllInner]);

  useEffect(() => {
    // Mit zugelassenem Cache gleich laden, ohne auf die Zugangsprüfung zu warten (die Datenbank prüft selbst)
    if (cached?.allowed) loadAll();
    supabase.rpc("is_admin").then(({ data, error }) => {
      if (!error) setAdmin(data === true);
    });
    supabase.rpc("is_allowed").then(({ data, error }) => {
      // Netzfehler: beim Stand aus dem Cache bleiben statt „Kein Zugang“ zu zeigen
      if (error) {
        setItems((old) => old ?? []);
        setError("Keine Verbindung. Angezeigt wird der letzte Stand.");
        return;
      }
      setAllowed(data === true);
      if (data === true && !cached?.allowed) loadAll();
    });
    // nur einmal beim Start
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadAll]);

  const symbolKey = uniqueSymbols(items ?? [], sharedItems).join(",");
  useEffect(() => {
    if (!allowed || !symbolKey) return;
    const id = setInterval(() => loadQuotes(symbolKey.split(",")), REFRESH_MS);
    return () => clearInterval(id);
  }, [allowed, symbolKey, loadQuotes]);

  // Zurück im Tab: Änderungen der anderen an geteilten Listen holen
  useEffect(() => {
    if (!allowed) return;
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - lastLoad.current > REVISIT_MS)
        loadAll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [allowed, loadAll]);

  return {
    allowed,
    items,
    setItems,
    groups,
    setGroups,
    admin,
    sharedLists,
    setSharedLists,
    sharedItems,
    setSharedItems,
    quotes,
    profiles,
    events,
    signals,
    error,
    setError,
    updated,
    loadAll,
    refreshing,
  };
}

/** Symbole der eigenen und der geteilten Listen, ohne Doppelte (Kurse je Symbol nur einmal holen). */
export function uniqueSymbols(...lists: { symbol: string }[][]): string[] {
  return [...new Set(lists.flat().map((i) => i.symbol))];
}
