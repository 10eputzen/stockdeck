import { useState, type ReactNode } from "react";
import type { SearchResult, SharedItem, SharedList } from "../lib/supabase";
import { AddStock } from "./AddStock";
import { NameEditor } from "./GroupHeader";

/** Personen-Symbol für „geteilt“ (gleiche Strichstärke wie die übrigen Icons). */
export function ShareIcon() {
  return (
    <svg className="shareicon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 19c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" />
      <path d="M16 5.2a3 3 0 0 1 0 5.6M18 13.8c1.9.7 3 2.5 3 5.2" />
    </svg>
  );
}

/** Geteilte Liste als eigener Block unter den Gruppen: Kopf mit Teilen-Knopf, Werte ohne Ziehen. */
export function SharedSection({
  list,
  items,
  isOwner,
  collapsed,
  onToggle,
  onRename,
  onShare,
  onAdd,
  children,
}: {
  list: SharedList;
  items: SharedItem[];
  isOwner: boolean;
  collapsed: boolean;
  onToggle: () => void;
  onRename: (name: string) => void;
  onShare: () => void;
  onAdd: (r: SearchResult) => void;
  children: (i: SharedItem) => ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const people = list.members.length + 1;
  const who = isOwner
    ? `Geteilt mit ${list.members.map((m) => m.email).join(", ") || "noch niemandem"}`
    : `Geteilt von ${list.owner_name}`;
  return (
    <section className="group shared" aria-label={`Geteilte Liste ${list.name}`}>
      <div className="grouphead">
        <span className="ghost icon gh-tool handle-ph" aria-hidden="true">⠿</span>
        <button
          className="ghost icon chevron"
          aria-expanded={!collapsed}
          aria-label={collapsed ? `${list.name} aufklappen` : `${list.name} einklappen`}
          onClick={onToggle}
        >
          <span className={collapsed ? "rot" : ""}>▾</span>
        </button>
        {editing ? (
          <NameEditor
            initial={list.name}
            onDone={(name) => {
              setEditing(false);
              onRename(name);
            }}
          />
        ) : (
          <button
            className="groupname"
            onClick={onToggle}
            onDoubleClick={() => isOwner && setEditing(true)}
          >
            {list.name}
          </button>
        )}
        <button className="sharetag" onClick={onShare} title={who} aria-label={`${who}. Teilen verwalten`}>
          <ShareIcon />
          <span>{people}</span>
        </button>
        <span className="muted small-count">{items.length}</span>
        <span className="grow" />
        <button
          className={`ghost icon ${adding ? "on" : ""}`}
          aria-label={`Aktie zu ${list.name} hinzufügen`}
          aria-expanded={adding}
          title="Aktie hinzufügen"
          onClick={() => setAdding((a) => !a)}
        >
          +
        </button>
        {isOwner && (
          <button
            className="ghost icon gh-tool"
            aria-label={`${list.name} umbenennen`}
            title="Umbenennen"
            onClick={() => setEditing(true)}
          >
            ✎
          </button>
        )}
      </div>
      {adding && (
        <div className="shared-add">
          <AddStock
            inline
            autoFocus
            existing={items.map((i) => i.symbol)}
            onAdd={(r) => onAdd(r)}
          />
        </div>
      )}
      {!collapsed && (
        <div className="dropzone">
          {items.map(children)}
          {items.length === 0 && (
            <div className="drophint muted">Noch leer. Über + Aktien hinzufügen.</div>
          )}
        </div>
      )}
    </section>
  );
}
