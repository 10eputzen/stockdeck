import {
  closestCenter,
  KeyboardSensor,
  pointerWithin,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import {
  useCallback,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { t } from "../i18n";
import { supabase, type Group, type WatchItem } from "../lib/supabase";
import { byPos, containerOf, NONE, persistContainer } from "./model";

// Gruppen ziehen nur auf Gruppen, Werte auf Werte oder Bereiche
const collision: CollisionDetection = (args) => {
  const type = args.active.data.current?.type;
  const droppableContainers = args.droppableContainers.filter((c) => {
    const t = c.data.current?.type;
    return type === "group" ? t === "group" : t === "item" || t === "container";
  });
  if (type !== "group") {
    const hits = pointerWithin({ ...args, droppableContainers });
    const itemHit = hits.find(
      (h) =>
        droppableContainers.find((c) => c.id === h.id)?.data.current?.type ===
        "item",
    );
    if (itemHit) return [itemHit];
    if (hits.length) return hits;
  }
  return closestCenter({ ...args, droppableContainers });
};

/** Drag and Drop für Werte und Gruppen inkl. Speichern und Zurückrollen. */
export function useWatchlistDnd({
  items,
  setItems,
  groups,
  setGroups,
  sortedGroups,
  lists,
  setError,
}: {
  items: WatchItem[] | null;
  setItems: Dispatch<SetStateAction<WatchItem[] | null>>;
  groups: Group[];
  setGroups: Dispatch<SetStateAction<Group[]>>;
  sortedGroups: Group[];
  lists: Record<string, WatchItem[]>;
  setError: (msg: string) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const lastDrag = useRef(0);
  const dragStart = useRef<{ items: WatchItem[]; groups: Group[] } | null>(
    null,
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 220, tolerance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const targetContainer = (e: DragOverEvent | DragEndEvent) => {
    const d = e.over?.data.current;
    if (!d) return null;
    if (d.type === "container") return d.container as string;
    if (d.type === "item")
      return containerOf(
        (items ?? []).find((i) => i.id === e.over?.id) ?? ({} as WatchItem),
      );
    return null;
  };

  function onDragStart(e: DragStartEvent) {
    dragStart.current = { items: items ?? [], groups };
    setActiveId(String(e.active.id));
  }

  function onDragOver(e: DragOverEvent) {
    if (e.active.data.current?.type !== "item" || !items) return;
    const target = targetContainer(e);
    const active = items.find((i) => i.id === e.active.id);
    if (!target || !active || containerOf(active) === target) return;
    const overItem = items.find((i) => i.id === e.over?.id);
    const list = lists[target] ?? [];
    const position = overItem
      ? overItem.position - 0.5
      : (list[list.length - 1]?.position ?? 0) + 1;
    setItems(
      items.map((i) =>
        i.id === active.id
          ? { ...i, group_id: target === NONE ? null : target, position }
          : i,
      ),
    );
  }

  async function dropGroup(e: DragEndEvent, start: Group[]) {
    if (!e.over || e.over.id === e.active.id) return;
    const ids = sortedGroups.map((g) => `g:${g.id}`);
    const moved = arrayMove(
      sortedGroups,
      ids.indexOf(String(e.active.id)),
      ids.indexOf(String(e.over.id)),
    );
    const next = moved.map((g, idx) => ({ ...g, position: idx }));
    setGroups(next);
    const { error } = await supabase.rpc("reorder_groups", {
      p_ids: next.map((g) => g.id),
    });
    if (error) {
      setGroups(start);
      setError(t("watchlist.errReorder"));
    }
  }

  async function dropItem(e: DragEndEvent, start: WatchItem[]) {
    if (!items) return;
    const active = items.find((i) => i.id === e.active.id);
    if (!active) return;
    const container = containerOf(active);
    let list = items.filter((i) => containerOf(i) === container).sort(byPos);
    const overIdx = list.findIndex((i) => i.id === e.over?.id);
    const fromIdx = list.findIndex((i) => i.id === active.id);
    if (overIdx >= 0 && overIdx !== fromIdx)
      list = arrayMove(list, fromIdx, overIdx);
    const renumbered = list.map((i, idx) => ({ ...i, position: idx }));

    const origin = start.find((i) => i.id === active.id);
    const originContainer = origin ? containerOf(origin) : container;
    const originList =
      originContainer !== container
        ? items
            .filter((i) => containerOf(i) === originContainer)
            .sort(byPos)
            .map((i, idx) => ({ ...i, position: idx }))
        : [];

    const changed = new Map(
      [...renumbered, ...originList].map((i) => [i.id, i]),
    );
    const unchanged =
      originContainer === container &&
      renumbered.every(
        (i) => start.find((s) => s.id === i.id)?.position === i.position,
      );
    setItems(items.map((i) => changed.get(i.id) ?? i));
    if (unchanged) return;

    const results = await Promise.all([
      persistContainer(container, renumbered),
      originList.length
        ? persistContainer(originContainer, originList)
        : Promise.resolve({ error: null }),
    ]);
    if (results.some((r) => r.error)) {
      setItems(start);
      setError(t("watchlist.errMove"));
    }
  }

  async function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    lastDrag.current = Date.now();
    const start = dragStart.current;
    dragStart.current = null;
    if (!start) return;
    if (e.active.data.current?.type === "group")
      return dropGroup(e, start.groups);
    return dropItem(e, start.items);
  }

  const onDragCancel = useCallback(() => {
    if (dragStart.current) setItems(dragStart.current.items);
    dragStart.current = null;
    setActiveId(null);
  }, [setItems]);

  /** true, wenn gerade eben eine Zeile losgelassen wurde (kein Öffnen). */
  const justDropped = () => Date.now() - lastDrag.current <= 300;

  return {
    activeId,
    justDropped,
    dndProps: {
      sensors,
      collisionDetection: collision,
      onDragStart,
      onDragOver,
      onDragEnd,
      onDragCancel,
    },
  };
}
