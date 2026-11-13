import { supabase, type WatchItem } from "../lib/supabase";

/** Schlüssel des Bereichs „Ohne Gruppe“. */
export const NONE = "__none";

export const containerOf = (i: WatchItem) => i.group_id ?? NONE;

export const byPos = (a: { position: number }, b: { position: number }) =>
  a.position - b.position;

/** Speichert die Reihenfolge einer Gruppe (oder „Ohne Gruppe“). */
export const persistContainer = (container: string, list: WatchItem[]) =>
  supabase.rpc("reorder_items", {
    p_group: container === NONE ? null : container,
    p_ids: list.map((i) => i.id),
  });
