import { useState, type Dispatch, type SetStateAction } from "react";
import { readCache, writeCache } from "../lib/cache";
import {
  supabase,
  type Group,
  type SearchResult,
  type SharedItem,
  type SharedList,
} from "../lib/supabase";
import type { ToastState } from "../Toast";
import { useDialogs } from "../ui/useDialogs";

/** Aktionen für geteilte Listen (optimistisch, bei Fehlern neu laden). */
export function useSharedActions({
  userId,
  sharedItems,
  setSharedItems,
  setSharedLists,
  setError,
  loadAll,
  setToast,
  narrow,
}: {
  userId: string;
  sharedItems: SharedItem[];
  setSharedItems: Dispatch<SetStateAction<SharedItem[]>>;
  setSharedLists: Dispatch<SetStateAction<SharedList[]>>;
  setError: (msg: string | null) => void;
  loadAll: () => Promise<void> | void;
  setToast: (t: ToastState) => void;
  narrow: boolean;
}) {
  const { confirm } = useDialogs();
  // Eingeklappt-Zustand je Nutzer und Gerät
  const key = `shcol:${userId}`;
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(
    () => readCache<Record<string, boolean>>(key) ?? {},
  );

  const fail = (msg: string) => {
    setError(msg);
    loadAll();
  };

  function toggle(list: SharedList) {
    setCollapsed((old) => {
      const next = { ...old, [list.id]: !old[list.id] };
      writeCache(key, next);
      return next;
    });
  }

  async function add(list: SharedList, r: SearchResult) {
    const own = sharedItems.filter((i) => i.list_id === list.id);
    const there = own.find((i) => i.symbol === r.symbol);
    if (there)
      return setToast({ text: `${r.symbol} ist schon drin (von ${there.added_by_name})` });
    const { error } = await supabase.from("shared_list_items").insert({
      list_id: list.id,
      symbol: r.symbol,
      name: r.name,
      position: own.length ? Math.max(...own.map((i) => i.position)) + 1 : 0,
    });
    if (error?.code === "23505")
      setToast({ text: `${r.symbol} ist schon drin (jemand war schneller)` });
    else if (error) setError("Konnte nicht hinzugefügt werden.");
    else if (narrow) setToast({ text: `${r.symbol} zu „${list.name}“ hinzugefügt` });
    await loadAll();
  }

  async function remove(item: SharedItem) {
    setSharedItems((list) => list.filter((i) => i.id !== item.id));
    const { error } = await supabase
      .from("shared_list_items")
      .delete()
      .eq("id", item.id);
    if (error) return fail("Konnte nicht entfernt werden.");
    setToast({
      text: `${item.symbol} entfernt`,
      action: {
        label: "Rückgängig",
        run: async () => {
          const { error } = await supabase.from("shared_list_items").insert({
            list_id: item.list_id,
            symbol: item.symbol,
            name: item.name,
            position: item.position,
          });
          if (error && error.code !== "23505") setError("Wiederherstellen fehlgeschlagen.");
          await loadAll();
        },
      },
    });
  }

  async function rename(list: SharedList, name: string) {
    if (!name) return;
    setSharedLists((ls) => ls.map((l) => (l.id === list.id ? { ...l, name } : l)));
    const { error } = await supabase
      .from("shared_lists")
      .update({ name })
      .eq("id", list.id);
    if (error) fail("Umbenennen fehlgeschlagen.");
  }

  /** Macht aus einer eigenen Gruppe eine geteilte Liste; liefert deren ID. */
  async function shareGroup(g: Group): Promise<string | null> {
    const ok = await confirm({
      title: `Gruppe „${g.name}“ teilen?`,
      message: "Sie wird zur geteilten Liste, ihre Werte wandern mit. Danach lädst du Personen per E-Mail ein.",
      confirmLabel: "Teilen",
    });
    if (!ok) return null;
    const { data, error } = await supabase.rpc("share_group", { p_group: g.id });
    await loadAll();
    if (error) {
      setError("Gruppe konnte nicht geteilt werden.");
      return null;
    }
    return data as string;
  }

  async function invite(list: SharedList, email: string): Promise<string | null> {
    const { error } = await supabase.rpc("invite_to_list", {
      p_list: list.id,
      p_email: email,
    });
    if (error) return error.message || "Einladen fehlgeschlagen.";
    await loadAll();
    return null;
  }

  async function removeMember(list: SharedList, email: string) {
    setSharedLists((ls) =>
      ls.map((l) =>
        l.id === list.id ? { ...l, members: l.members.filter((m) => m.email !== email) } : l,
      ),
    );
    const { error } = await supabase
      .from("shared_list_members")
      .delete()
      .eq("list_id", list.id)
      .eq("email", email);
    if (error) fail("Konnte nicht entfernt werden.");
  }

  async function leave(list: SharedList, myEmail: string) {
    const ok = await confirm({
      title: `Liste „${list.name}“ verlassen?`,
      message: "Du siehst sie danach nicht mehr.",
      confirmLabel: "Verlassen",
      danger: true,
    });
    if (!ok) return false;
    const { error } = await supabase
      .from("shared_list_members")
      .delete()
      .eq("list_id", list.id)
      .eq("email", myEmail.toLowerCase());
    if (error) {
      fail("Verlassen fehlgeschlagen.");
      return false;
    }
    await loadAll();
    return true;
  }

  async function unshare(list: SharedList) {
    const ok = await confirm({
      title: `Teilen von „${list.name}“ beenden?`,
      message:
        "Die Liste verschwindet für alle anderen, ihre Werte kommen als eigene Gruppe zurück. Wer nur über diese Liste Zugang hatte, verliert den Zugang zu Stockdeck.",
      confirmLabel: "Beenden",
      danger: true,
    });
    if (!ok) return false;
    const { error } = await supabase.rpc("unshare_list", { p_list: list.id });
    await loadAll();
    if (error) {
      setError("Teilen konnte nicht beendet werden.");
      return false;
    }
    setToast({ text: `„${list.name}“ ist wieder eine eigene Gruppe` });
    return true;
  }

  return {
    collapsed,
    toggle,
    add,
    remove,
    rename,
    shareGroup,
    invite,
    removeMember,
    leave,
    unshare,
  };
}
