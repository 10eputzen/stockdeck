import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const people = list.members.length + 1;
  const who = isOwner
    ? t("watchlist.sharedWith", {
        members: list.members.map((m) => m.email).join(", ") || t("watchlist.nobodyYet"),
      })
    : t("watchlist.sharedBy", { owner: list.owner_name });
  return (
    <section className="group shared" aria-label={t("watchlist.sharedListAria", { name: list.name })}>
      <div className="grouphead">
        <span className="ghost icon gh-tool handle-ph" aria-hidden="true">⠿</span>
        <button
          className="ghost icon chevron"
          aria-expanded={!collapsed}
          aria-label={collapsed ? t("watchlist.expandGroup", { name: list.name }) : t("watchlist.collapseGroup", { name: list.name })}
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
        <button className="sharetag" onClick={onShare} title={who} aria-label={t("watchlist.manageSharingAria", { who })}>
          <ShareIcon />
          <span>{people}</span>
        </button>
        <span className="muted small-count">{items.length}</span>
        <span className="grow" />
        <button
          className={`ghost icon ${adding ? "on" : ""}`}
          aria-label={t("watchlist.addStockToListAria", { name: list.name })}
          aria-expanded={adding}
          title={t("watchlist.addStock")}
          onClick={() => setAdding((a) => !a)}
        >
          +
        </button>
        {isOwner && (
          <button
            className="ghost icon gh-tool"
            aria-label={t("watchlist.renameItemAria", { name: list.name })}
            title={t("watchlist.rename")}
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
            <div className="drophint muted">{t("watchlist.sharedEmpty")}</div>
          )}
        </div>
      )}
    </section>
  );
}
