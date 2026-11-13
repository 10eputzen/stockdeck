import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ReactNode } from "react";
import { FLEX_MIN, flexKey, MAX_WIDTH, MIN_WIDTH, type Columns, type OrderKey } from "../lib/columns";
import type { Group, WatchItem } from "../lib/supabase";
import { GroupHeader } from "./GroupHeader";

type Widths = Columns["widths"];

/**
 * Griff an der rechten Spaltengrenze, mittig im Abstand zur nächsten Spalte (wie in Excel oder Notion):
 * Ziehen ändert nur die Spalte links davon, die Grenze folgt der Maus, alles rechts davon wandert mit.
 * Breiter geht nur, solange die Tabelle in die Breite passt; Platz schafft man durch Schmalerziehen anderer Spalten.
 * Doppelklick setzt die Breite zurück.
 */
function ResizeHandle({
  label,
  freeze,
  onWidths,
  onReset,
}: {
  label: string;
  /** Hat die flexible Spalte noch keine Breite, wird sie beim Ziehen auf ihre aktuelle Breite festgesetzt */
  freeze: OrderKey | null;
  onWidths: (w: Widths, done: boolean) => void;
  onReset: () => void;
}) {
  return (
    <span
      className="colresize"
      role="separator"
      aria-orientation="vertical"
      aria-label={`Breite von ${label} ändern`}
      title="Ziehen: Breite ändern · Doppelklick: zurücksetzen"
      onDoubleClick={onReset}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        const cell = e.currentTarget.parentElement!;
        const startX = e.clientX;
        const start = cell.getBoundingClientRect().width;
        const row = cell.parentElement!;
        const key = cell.dataset.col as OrderKey;
        const fixed: Widths = {};
        // Platz zum Breiterziehen: die Tabelle bleibt in ihrer Breite, es gibt keine Scrollleiste
        let room = row.lastElementChild!.getBoundingClientRect().width - 32;
        const flexCell = freeze && row.querySelector(`[data-col="${freeze}"]`);
        if (freeze && flexCell) {
          const flexWidth = flexCell.getBoundingClientRect().width;
          if (cell.compareDocumentPosition(flexCell) & Node.DOCUMENT_POSITION_FOLLOWING) {
            // flexible Spalte rechts davon: sie gibt den Platz her, die Grenze folgt trotzdem der Maus
            room = flexWidth - FLEX_MIN;
          } else {
            // flexible Spalte links davon: auf ihre Breite festsetzen, sonst liefe die Grenze nicht mit
            fixed[freeze] = Math.round(flexWidth);
            room = 0;
          }
        }
        const max = Math.min(MAX_WIDTH, start + Math.max(0, room));
        let moved = false;
        const widths = (ev: PointerEvent): Widths => ({
          ...fixed,
          [key]: Math.round(Math.min(max, Math.max(MIN_WIDTH, start + ev.clientX - startX))),
        });
        const move = (ev: PointerEvent) => {
          moved ||= ev.clientX !== startX;
          if (moved) onWidths(widths(ev), false);
        };
        const up = (ev: PointerEvent) => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
          window.removeEventListener("pointercancel", up);
          document.body.classList.remove("col-resizing");
          // Ein bloßer Klick (auch der erste eines Doppelklicks) ändert nichts
          if (moved) onWidths(widths(ev), true);
        };
        document.body.classList.add("col-resizing");
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
        window.addEventListener("pointercancel", up);
      }}
    />
  );
}

const HEAD: Record<OrderKey, { label: string; cls: string }> = {
  symbol: { label: "Kürzel", cls: "cell" },
  name: { label: "Name", cls: "cell" },
  price: { label: "Kurs", cls: "cell num" },
  chg_abs: { label: "Heute $", cls: "cell num hide-sm" },
  chg_pct: { label: "Heute %", cls: "cell num" },
  range: { label: "Tagesspanne", cls: "cell num hide-sm" },
  analyst: { label: "Analysten", cls: "cell hide-sm" },
  earnings: { label: "Nächste Zahlen", cls: "cell hide-sm" },
};

export function HeaderRow({
  cols,
  onWidths,
  onReset,
}: {
  cols: Columns;
  onWidths: (widths: Widths, done: boolean) => void;
  onReset: (key: OrderKey) => void;
}) {
  const flex = flexKey(cols);
  const freeze = flex && !cols.widths[flex] ? flex : null;
  return (
    <div className="row head">
      {cols.logo && <span />}
      {!cols.name && !cols.symbol && <span />}
      {cols.order.map((k) =>
        cols[k] ? (
          <span key={k} data-col={k} className={HEAD[k].cls + (k === "name" && cols.symbol ? " hide-sm" : "")}>
            {HEAD[k].label}
            <ResizeHandle
              label={HEAD[k].label}
              freeze={freeze === k ? null : freeze}
              onWidths={onWidths}
              onReset={() => onReset(k)}
            />
          </span>
        ) : null,
      )}
      <span />
    </div>
  );
}

export function GroupSection({
  group,
  children,
  ...head
}: {
  group: Group;
  count: number;
  editing: boolean;
  onToggle: () => void;
  onRename: (name: string) => void;
  onStartEdit: () => void;
  onDelete: () => void;
  onShare?: () => void;
  children: ReactNode;
}) {
  const {
    setNodeRef,
    isDragging,
    transform,
    transition,
    setActivatorNodeRef,
    attributes,
    listeners,
  } = useSortable({ id: `g:${group.id}`, data: { type: "group" } });
  return (
    <section
      ref={setNodeRef}
      className={`group ${isDragging ? "dragging" : ""}`}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      aria-label={`Gruppe ${group.name}`}
    >
      <GroupHeader
        group={group}
        sortable={{ setActivatorNodeRef, attributes, listeners }}
        {...head}
      />
      {children}
    </section>
  );
}

export function Container({
  id,
  list,
  hidden,
  children,
}: {
  id: string;
  list: WatchItem[];
  hidden?: boolean;
  children: (i: WatchItem) => ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `c:${id}`,
    data: { type: "container", container: id },
  });
  return (
    <SortableContext
      items={hidden ? [] : list.map((i) => i.id)}
      strategy={verticalListSortingStrategy}
    >
      <div
        ref={setNodeRef}
        className={`dropzone ${isOver ? "over" : ""} ${list.length === 0 || hidden ? "empty" : ""}`}
      >
        {!hidden && list.map(children)}
        {!hidden && list.length === 0 && (
          <div className="drophint muted">Hierher ziehen</div>
        )}
      </div>
    </SortableContext>
  );
}

