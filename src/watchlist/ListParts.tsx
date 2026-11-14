import { DragOverlay } from "@dnd-kit/core";
import type { CSSProperties, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { time } from "../lib/format";
import type { Group, WatchItem } from "../lib/supabase";
import { Container } from "./Groups";
import { NONE } from "./model";

/** Werte ohne Gruppe; die Überschrift erscheint nur, wenn es Gruppen gibt. */
export function UngroupedSection({
  list,
  showHead,
  children,
}: {
  list: WatchItem[];
  showHead: boolean;
  children: (i: WatchItem) => ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <section className="group">
      {showHead && (
        <div className="grouphead">
          <span className="groupname static">{t("watchlist.ungrouped")}</span>
          <span className="muted small-count">{list.length}</span>
        </div>
      )}
      <Container id={NONE} list={list}>
        {children}
      </Container>
    </section>
  );
}

/** Was beim Ziehen am Zeiger hängt: eine Zeile oder ein Gruppenkopf. */
export function DragPreview({
  row,
  group,
  gridVars,
}: {
  row?: ReactNode;
  group?: Group;
  gridVars: CSSProperties;
}) {
  return (
    <DragOverlay dropAnimation={null}>
      {row ? (
        <div className="overlay" style={gridVars}>
          {row}
        </div>
      ) : group ? (
        <div className="overlay grouphead">
          <span className="groupname static">{group.name}</span>
        </div>
      ) : null}
    </DragOverlay>
  );
}

/** Status unter der Liste, damit Meldungen nichts verschieben. */
export function StatusLine({
  error,
  refreshing,
  updated,
}: {
  error: string | null;
  refreshing: boolean;
  updated: Date | null;
}) {
  const { t } = useTranslation();
  return (
    <p className={`small ${error ? "error" : "muted"}`}>
      {error ??
        (refreshing
          ? t("watchlist.refreshing")
          : updated
            ? t("watchlist.updatedAt", { time: time.format(updated) })
            : " ")}
    </p>
  );
}
