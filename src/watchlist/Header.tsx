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
}) {
  return (
    <div className="listhead">
      <h1>Watchlist</h1>
      {narrow ? (
        <div className="mtools">
          <button
            className="ghost iconbtn"
            onClick={onSearch}
            aria-label="Aktie hinzufügen"
            title="Aktie hinzufügen"
          >
            <RouteIcon route="suche" size={20} />
          </button>
          <button
            className={`ghost iconbtn refreshbtn ${refreshing ? "spin" : ""}`}
            onClick={onRefresh}
            aria-label="Aktualisieren"
            title="Aktualisieren"
          >
            <span><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.5-5.8" /><path d="M20 4v5h-5" /></svg></span>
          </button>
          <button
            className={`ghost editbtn ${editMode ? "on" : ""}`}
            onClick={onToggleEdit}
          >
            {editMode ? "Fertig" : "Bearbeiten"}
          </button>
        </div>
      ) : (
        <>
          <AddStock onAdd={onAdd} existing={existing} />
          <div className="tools">
            <button className="ghost" onClick={onAddGroup}>
              + Gruppe
            </button>
            <button className="ghost" onClick={onImport}>
              Import
            </button>
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
  return (
    <div
      className="sheet"
      role="dialog"
      aria-modal="true"
      aria-label="Aktie hinzufügen"
    >
      <div className="listhead">
        <h1>Aktie hinzufügen</h1>
        <button className="ghost" onClick={onClose}>
          Fertig
        </button>
      </div>
      <AddStock onAdd={onAdd} existing={existing} autoFocus inline />
    </div>
  );
}
