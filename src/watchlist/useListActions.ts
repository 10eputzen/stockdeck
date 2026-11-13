import {
  useCallback,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { t } from "../i18n";
import {
  supabase,
  type Group,
  type SearchResult,
  type WatchItem,
} from "../lib/supabase";
import type { ToastState } from "../Toast";
import { containerOf, NONE, persistContainer } from "./model";
import { useDialogs } from "../ui/useDialogs";

/** Hinzufügen, Entfernen und Gruppen-Aktionen mit optimistischem Update. */
export function useListActions({
  groups,
  setGroups,
  setItems,
  sortedGroups,
  lists,
  setError,
  loadAll,
  setToast,
  narrow,
}: {
  groups: Group[];
  setGroups: Dispatch<SetStateAction<Group[]>>;
  setItems: Dispatch<SetStateAction<WatchItem[] | null>>;
  sortedGroups: Group[];
  lists: Record<string, WatchItem[]>;
  setError: (msg: string | null) => void;
  loadAll: () => Promise<void> | void;
  setToast: (t: ToastState) => void;
  narrow: boolean;
}) {
  const { confirm } = useDialogs();
  const [editing, setEditing] = useState<string | null>(null);

  const fail = useCallback(
    (msg: string) => {
      setError(msg);
      loadAll();
    },
    [setError, loadAll],
  );

  async function add(r: SearchResult) {
    const none = lists[NONE];
    const { error } = await supabase.from("watchlist_items").insert({
      symbol: r.symbol,
      name: r.name,
      group_id: null,
      position: none.length ? none[none.length - 1].position + 1 : 0,
    });
    if (error && error.code !== "23505")
      setError(t("watchlist.errAdd"));
    else if (narrow) setToast({ text: t("watchlist.addedToast", { symbol: r.symbol }) });
    await loadAll();
  }

  async function remove(item: WatchItem) {
    setItems((list) => (list ?? []).filter((i) => i.id !== item.id));
    const { error } = await supabase
      .from("watchlist_items")
      .delete()
      .eq("id", item.id);
    if (error) return fail(t("watchlist.errRemove"));
    setToast({
      text: t("watchlist.removedToast", { symbol: item.symbol }),
      action: {
        label: t("watchlist.undo"),
        run: async () => {
          setItems((list) => [...(list ?? []), item]);
          const { error } = await supabase.from("watchlist_items").insert(item);
          if (error) fail(t("watchlist.errRestore"));
        },
      },
    });
  }

  async function addGroup() {
    const names = new Set(groups.map((g) => g.name.toLowerCase()));
    const baseName = t("watchlist.newGroupDefault");
    let name = baseName;
    for (let n = 2; names.has(name.toLowerCase()); n++)
      name = `${baseName} ${n}`;
    const position = sortedGroups.length
      ? sortedGroups[sortedGroups.length - 1].position + 1
      : 0;
    const { data, error } = await supabase
      .from("watchlist_groups")
      .insert({ name, position })
      .select("id, name, position, collapsed")
      .single();
    if (error) return setError(t("watchlist.errCreateGroup"));
    setGroups((g) => [...g, data]);
    setEditing(data.id);
  }

  async function renameGroup(g: Group, name: string) {
    setEditing(null);
    if (!name) return;
    setGroups((list) => list.map((x) => (x.id === g.id ? { ...x, name } : x)));
    const { error } = await supabase
      .from("watchlist_groups")
      .update({ name })
      .eq("id", g.id);
    if (error)
      fail(
        error.code === "23505"
          ? t("watchlist.errGroupExists", { name })
          : t("watchlist.errRename"),
      );
  }

  async function toggleGroup(g: Group) {
    const collapsed = !g.collapsed;
    setGroups((list) =>
      list.map((x) => (x.id === g.id ? { ...x, collapsed } : x)),
    );
    const { error } = await supabase
      .from("watchlist_groups")
      .update({ collapsed })
      .eq("id", g.id);
    if (error) fail(t("watchlist.errSave"));
  }

  async function deleteGroup(g: Group) {
    const moved = lists[g.id] ?? [];
    const ok = await confirm({
      title: t("watchlist.deleteGroupConfirmTitle", { name: g.name }),
      message: moved.length ? t("watchlist.deleteGroupConfirmMoved", { count: moved.length }) : undefined,
      confirmLabel: t("watchlist.delete"),
      danger: true,
    });
    if (!ok) return;
    const next = [...lists[NONE], ...moved].map((i, idx) => ({
      ...i,
      group_id: null,
      position: idx,
    }));
    setGroups((list) => list.filter((x) => x.id !== g.id));
    setItems((list) => [
      ...(list ?? []).filter(
        (i) => containerOf(i) !== NONE && i.group_id !== g.id,
      ),
      ...next,
    ]);
    const r1 = await persistContainer(NONE, next);
    const r2 = await supabase.from("watchlist_groups").delete().eq("id", g.id);
    if (r1.error || r2.error) fail(t("watchlist.errDeleteGroup"));
  }

  return {
    editing,
    setEditing,
    add,
    remove,
    addGroup,
    renameGroup,
    toggleGroup,
    deleteGroup,
  };
}
