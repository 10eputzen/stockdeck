import { useTranslation } from "react-i18next";
import type { Columns } from "../lib/columns";
import type { SearchResult } from "../lib/supabase";
import { ColumnMenu } from "../ColumnMenu";
import { AddStock } from "./AddStock";
import { RouteIcon } from "./Nav";

/** Kopf der Watchlist: mobil Lupe/Aktualisieren/Bearbeiten, Desktop Suche und Werkzeuge. */
export function WatchHeader({
  narrow,
  editMode,
  onToggleEdit,
  onSearch,
  onRefresh,
  refreshing,
  onAdd,
  existing,
  onAddGroup,
  onImport,
  cols,
  setCols,
  view,
  onToggleView,
}: {
  narrow: boolean;
  editMode: boolean;
  onToggleEdit: () => void;
  onSearch: () => void;
  onRefresh: () => void;
  refreshing?: boolean;
  onAdd: (r: SearchResult) => void;
  existing: string[];
  onAddGroup: () => void;
  onImport: () => void;
  cols: Columns;
  setCols: (c: Columns) => void;
  view: "list" | "heat";
  onToggleView: () => void;
}) {
  const { t } = useTranslation();
  const viewLabel = view === "heat" ? t("heatmap.showList") : t("heatmap.showTiles");
  const viewBtn = (
    <button
      className={`ghost ${narrow ? "iconbtn" : ""} ${view === "heat" ? "on" : ""}`}
      onClick={onToggleView}
      aria-pressed={view === "heat"}
      aria-label={viewLabel}
      title={viewLabel}
    >
      {narrow ? (
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          {view === "heat" ? <path d="M4 6h16M4 12h16M4 18h16" /> : <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />}
        </svg>
      ) : view === "heat" ? (
        t("heatmap.list")
      ) : (
        t("heatmap.tiles")
      )}
    </button>
  );
  return (
    <div className="listhead">
      <h1>{t("watchlist.title")}</h1>
      {narrow ? (
        <div className="mtools">
          <button
            className="ghost iconbtn"
            onClick={onSearch}
            aria-label={t("watchlist.addStock")}
            title={t("watchlist.addStock")}
          >
            <RouteIcon route="suche" size={20} />
          </button>
          <button
            className={`ghost iconbtn refreshbtn ${refreshing ? "spin" : ""}`}
            onClick={onRefresh}
            aria-label={t("watchlist.refresh")}
            title={t("watchlist.refresh")}
          >
            <span><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.5-5.8" /><path d="M20 4v5h-5" /></svg></span>
          </button>
          {viewBtn}
          {view === "list" && (
            <button
              className={`ghost editbtn ${editMode ? "on" : "iconbtn"}`}
              onClick={onToggleEdit}
              aria-label={editMode ? undefined : t("watchlist.edit")}
              title={editMode ? undefined : t("watchlist.edit")}
            >
              {editMode ? (
                t("watchlist.done")
              ) : (
                // Stift statt Text: so passt die Kachel-Umschaltung daneben, ohne den Titel abzuschneiden
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                  <path d="M4 20h4L19 9l-4-4L4 16z" />
                  <path d="m14 6 4 4" />
                </svg>
              )}
            </button>
          )}
        </div>
      ) : (
        <>
          <AddStock onAdd={onAdd} existing={existing} />
          <div className="tools">
            <button className="ghost" onClick={onAddGroup}>
              {t("watchlist.addGroupShort")}
            </button>
            <button className="ghost" onClick={onImport}>
              {t("watchlist.import")}
            </button>
            {viewBtn}
            <ColumnMenu cols={cols} onChange={setCols} />
          </div>
        </>
      )}
    </div>
  );
}

/** Mobiles Vollbild-Overlay zum Hinzufügen einer Aktie. */
export function SearchSheet({
  onAdd,
  existing,
  onClose,
}: {
  onAdd: (r: SearchResult) => void;
  existing: string[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      className="sheet"
      role="dialog"
      aria-modal="true"
      aria-label={t("watchlist.addStock")}
    >
      <div className="listhead">
        <h1>{t("watchlist.addStock")}</h1>
        <button className="ghost" onClick={onClose}>
          {t("watchlist.done")}
        </button>
      </div>
      <AddStock onAdd={onAdd} existing={existing} autoFocus inline />
    </div>
  );
}
