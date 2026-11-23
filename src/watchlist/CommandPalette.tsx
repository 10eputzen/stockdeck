import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { rank, type Entry } from "../lib/palette";
import { searchSymbols, type SearchResult } from "../lib/supabase";
import { isCrypto } from "../lib/symbols";
import type { Route } from "../lib/nav";
import { resolveTheme, setThemePref } from "../lib/theme";

type Item = Entry & { group: "stocks" | "search" | "go" | "actions"; run: () => void; alt?: () => void; badge?: ReactNode };

const SEARCH_DELAY = 250;

/**
 * Befehlspalette (Strg+K, Cmd+K oder /): Werte der Watchlist öffnen, neue Aktien suchen und
 * hinzufügen, zu Bereichen springen, Gruppe/Import/Thema. Bedienung komplett per Tastatur.
 */
export function CommandPalette({
  watch,
  existing,
  onClose,
  onOpen,
  onAdd,
  go,
  onAddGroup,
  onImport,
}: {
  watch: { symbol: string; name: string | null }[];
  existing: string[];
  onClose: () => void;
  onOpen: (symbol: string) => void;
  onAdd: (r: SearchResult) => void;
  go: (r: Route) => void;
  onAddGroup: () => void;
  onImport: () => void;
}) {
  const { t } = useTranslation();
  const dialog = useRef<HTMLDialogElement>(null);
  const [q, setQ] = useState("");
  const [remote, setRemote] = useState<SearchResult[]>([]);
  const [sel, setSel] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  // Neue Werte serverseitig suchen (verzögert, nur ab 1 Zeichen); veraltete Antworten verwerfen
  useEffect(() => {
    const term = q.trim();
    if (!term) return;
    let stale = false;
    const id = setTimeout(() => {
      searchSymbols(term)
        .then((r) => !stale && setRemote(r))
        .catch(() => !stale && setRemote([]));
    }, SEARCH_DELAY);
    return () => {
      stale = true;
      clearTimeout(id);
    };
  }, [q]);

  const done = (fn: () => void) => () => {
    dialog.current?.close();
    fn();
  };

  const items = useMemo<Item[]>(() => {
    const term = q.trim();
    const have = new Set(existing);
    const stocks: Item[] = watch.map((w) => ({
      id: `w:${w.symbol}`,
      group: "stocks",
      label: w.symbol,
      detail: w.name ?? undefined,
      run: done(() => onOpen(w.symbol)),
    }));
    const found: Item[] = term
      ? remote
          .filter((r) => !have.has(r.symbol))
          .slice(0, 6)
          .map((r) => ({
            id: `s:${r.symbol}`,
            group: "search",
            label: r.symbol,
            detail: isCrypto(r.symbol) ? `${r.name} · ${t("common.crypto")}` : r.name,
            run: done(() => onOpen(r.symbol)),
            alt: done(() => onAdd(r)),
          }))
      : [];
    const nav: Item[] = [
      { id: "go:liste", group: "go", label: t("palette.goWatchlist"), keywords: "watchlist liste list", run: done(() => go("liste")) },
      { id: "go:portfolio", group: "go", label: t("palette.goPortfolio"), keywords: "portfolio depot", run: done(() => go("portfolio")) },
      { id: "go:konto", group: "go", label: t("palette.goAccount"), keywords: "konto account alarme alerts settings einstellungen", run: done(() => go("konto")) },
    ];
    const dark = resolveTheme() === "dark";
    const actions: Item[] = [
      { id: "a:group", group: "actions", label: t("palette.newGroup"), keywords: "gruppe group", run: done(onAddGroup) },
      { id: "a:import", group: "actions", label: t("palette.import"), keywords: "import csv tradingview", run: done(onImport) },
      { id: "a:theme", group: "actions", label: dark ? t("palette.themeLight") : t("palette.themeDark"), keywords: "theme thema hell dunkel light dark", run: done(() => setThemePref(dark ? "light" : "dark")) },
    ];
    // Ohne Suche: Bereiche und Aktionen zuerst, dann ein paar Werte
    return term
      ? [...rank(stocks, term, 6), ...found, ...rank([...nav, ...actions], term, 4)]
      : [...nav, ...actions, ...stocks.slice(0, 5)];
    // done ist pro Render neu, schließt aber nur über stabile Refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, remote, watch, existing, t, go, onOpen, onAdd, onAddGroup, onImport]);

  const current = Math.min(sel, Math.max(0, items.length - 1));

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${current}"]`)?.scrollIntoView({ block: "nearest" });
  }, [current]);

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const n = items.length;
      if (n) setSel((current + (e.key === "ArrowDown" ? 1 : n - 1)) % n);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const it = items[current];
      if (!it) return;
      if (e.shiftKey && it.alt) it.alt();
      else it.run();
    }
  }

  const head = { stocks: t("palette.inWatchlist"), search: t("palette.addNew"), go: t("palette.goTo"), actions: t("palette.actions") };
  return (
    <dialog ref={dialog} className="dialog palette" onClose={onClose} aria-label={t("palette.title")}>
      <input
        className="palette-input"
        autoFocus
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setSel(0);
          if (!e.target.value.trim()) setRemote([]);
        }}
        onKeyDown={onKey}
        placeholder={t("palette.placeholder")}
        aria-label={t("palette.placeholder")}
        aria-controls="palette-list"
        aria-activedescendant={items[current] ? `pal-${current}` : undefined}
        role="combobox"
        aria-expanded="true"
        spellCheck={false}
        autoComplete="off"
      />
      <ul id="palette-list" className="palette-list" role="listbox" ref={listRef}>
        {items.map((it, i) => (
          <li key={it.id} role="presentation">
            {(i === 0 || items[i - 1].group !== it.group) && <span className="palette-head">{head[it.group]}</span>}
            <div
              id={`pal-${i}`}
              data-idx={i}
              role="option"
              aria-selected={i === current}
              className={`palette-item ${i === current ? "on" : ""}`}
              onMouseMove={() => i !== current && setSel(i)}
              onClick={it.run}
            >
              <span className="palette-label">{it.label}</span>
              {it.detail && <span className="muted palette-detail">{it.detail}</span>}
              {it.alt && (
                <button
                  className="ghost palette-add"
                  onClick={(e) => {
                    e.stopPropagation();
                    it.alt!();
                  }}
                  title={t("palette.addHint")}
                >
                  + {t("palette.add")}
                </button>
              )}
            </div>
          </li>
        ))}
        {!items.length && <li className="muted palette-empty">{t("palette.nothing")}</li>}
      </ul>
      <p className="muted tiny palette-keys">{t("palette.keys")}</p>
    </dialog>
  );
}
