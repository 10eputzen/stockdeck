import { useState, type Dispatch, type SetStateAction } from "react";
import { t } from "../i18n";
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
      return setToast({ text: t("watchlist.alreadyInListBy", { symbol: r.symbol, name: there.added_by_name }) });
    const { error } = await supabase.from("shared_list_items").insert({
      list_id: list.id,
      symbol: r.symbol,
      name: r.name,
      position: own.length ? Math.max(...own.map((i) => i.position)) + 1 : 0,
    });
    if (error?.code === "23505")
      setToast({ text: t("watchlist.alreadyInListRace", { symbol: r.symbol }) });
    else if (error) setError(t("watchlist.errAdd"));
    else if (narrow) setToast({ text: t("watchlist.addedToListToast", { symbol: r.symbol, list: list.name }) });
    await loadAll();
  }

  async function remove(item: SharedItem) {
    setSharedItems((list) => list.filter((i) => i.id !== item.id));
    const { error } = await supabase
      .from("shared_list_items")
      .delete()
      .eq("id", item.id);
    if (error) return fail(t("watchlist.errRemove"));
    setToast({
      text: t("watchlist.removedToast", { symbol: item.symbol }),
      action: {
        label: t("watchlist.undo"),
        run: async () => {
          const { error } = await supabase.from("shared_list_items").insert({
            list_id: item.list_id,
            symbol: item.symbol,
            name: item.name,
            position: item.position,
          });
          if (error && error.code !== "23505") setError(t("watchlist.errRestore"));
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
    if (error) fail(t("watchlist.errRename"));
  }

  /** Macht aus einer eigenen Gruppe eine geteilte Liste; liefert deren ID. */
  async function shareGroup(g: Group): Promise<string | null> {
    const ok = await confirm({
      title: t("watchlist.shareGroupConfirmTitle", { name: g.name }),
      message: t("watchlist.shareGroupConfirmMsg"),
      confirmLabel: t("watchlist.share"),
    });
    if (!ok) return null;
    const { data, error } = await supabase.rpc("share_group", { p_group: g.id });
    await loadAll();
    if (error) {
      setError(t("watchlist.errShareGroup"));
      return null;
    }
    return data as string;
  }

  async function invite(list: SharedList, email: string): Promise<string | null> {
    const { error } = await supabase.rpc("invite_to_list", {
      p_list: list.id,
      p_email: email,
    });
    if (error) return error.message || t("watchlist.errInvite");
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
    if (error) fail(t("watchlist.errRemove"));
  }

  async function leave(list: SharedList, myEmail: string) {
    const ok = await confirm({
      title: t("watchlist.leaveConfirmTitle", { name: list.name }),
      message: t("watchlist.leaveConfirmMsg"),
      confirmLabel: t("watchlist.leave"),
      danger: true,
    });
    if (!ok) return false;
    const { error } = await supabase
      .from("shared_list_members")
      .delete()
      .eq("list_id", list.id)
      .eq("email", myEmail.toLowerCase());
    if (error) {
      fail(t("watchlist.errLeave"));
      return false;
    }
    await loadAll();
    return true;
  }

  async function unshare(list: SharedList) {
    const ok = await confirm({
      title: t("watchlist.unshareConfirmTitle", { name: list.name }),
      message: t("watchlist.unshareConfirmMsg"),
      confirmLabel: t("watchlist.endSharing"),
      danger: true,
    });
    if (!ok) return false;
    const { error } = await supabase.rpc("unshare_list", { p_list: list.id });
    await loadAll();
    if (error) {
      setError(t("watchlist.errUnshare"));
      return false;
    }
    setToast({ text: t("watchlist.unsharedToast", { name: list.name }) });
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
