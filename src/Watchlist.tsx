import { DndContext } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { lazy, Suspense, type ReactNode, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { COL_GAP, gridTemplate, useColumns } from "./lib/columns";
import type { SharedItem, WatchItem } from "./lib/supabase";
import { useLocation, useNarrow, type Route } from "./lib/nav";
import type { ToastState } from "./Toast";
import { useWatchlistData } from "./watchlist/useWatchlistData";
import { useWatchlistDnd } from "./watchlist/useWatchlistDnd";
import { useListActions } from "./watchlist/useListActions";
import { useSharedActions } from "./watchlist/useSharedActions";
import { byPos, containerOf, NONE } from "./watchlist/model";
import { rowData } from "./watchlist/rowData";
import { BottomNav, DeskTabs } from "./watchlist/Nav";
import { PageView } from "./ui/PageView";
import { Container, GroupSection, HeaderRow } from "./watchlist/Groups";
import { SearchSheet, WatchHeader } from "./watchlist/Header";
import { AccountPage } from "./watchlist/AccountPage";
import { SharedSection } from "./watchlist/SharedSection";
import { PlainRow, SkeletonRow, StaticRow, StockRow } from "./watchlist/Rows";
import { DragPreview, StatusLine, UngroupedSection } from "./watchlist/ListParts";
import { WatchDialogs } from "./watchlist/WatchDialogs";
import { CommandPalette } from "./watchlist/CommandPalette";
import { Heatmap } from "./watchlist/Heatmap";
import { isPaletteKey } from "./lib/palette";

// Chart-Bibliothek erst laden, wenn eine Detailseite geöffnet wird
const Detail = lazy(() =>
  import("./Detail").then((m) => ({ default: m.Detail })),
);
const PortfolioPage = lazy(() =>
  import("./Portfolio").then((m) => ({ default: m.PortfolioPage })),
);

// Code der Unterseiten im Leerlauf vorladen, damit beim Wechsel kein Platzhalter aufblitzt
if (typeof window !== "undefined")
  setTimeout(() => {
    void import("./Detail");
    void import("./Portfolio");
  }, 1500);

const SKELETON_ROWS = 6;

export function Watchlist({
  userId,
  email,
  onSignOut,
}: {
  userId: string;
  email?: string;
  onSignOut: () => void;
}) {
  const { t } = useTranslation();
  const narrow = useNarrow();
  const { loc, go, open, back } = useLocation();
  const route = loc.route;
  const [editMode, setEditMode] = useState(false);
  const {
    allowed,
    items,
    setItems,
    groups,
    setGroups,
    admin,
    sharedLists,
    setSharedLists,
    sharedItems,
    setSharedItems,
    quotes,
    profiles,
    events,
    signals,
    error,
    setError,
    updated,
    loadAll,
    refreshing,
  } = useWatchlistData(userId);
  const [cols, setCols, previewCols] = useColumns(userId);
  const [toast, setToast] = useState<ToastState>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState<string | null>(null);
  // 0 = zu; jede Öffnung bekommt eine neue Nummer, so öffnet ein schnelles Esc + Strg+K sicher neu
  const [palette, setPalette] = useState(0);
  // Liste oder Kacheln (Heatmap), je Gerät gemerkt
  const [view, setView] = useState<"list" | "heat">(() => {
    try {
      return localStorage.getItem("stockdeck.watchView") === "heat" ? "heat" : "list";
    } catch {
      return "list";
    }
  });
  const toggleView = () => {
    const next = view === "heat" ? "list" : "heat";
    setView(next);
    try {
      localStorage.setItem("stockdeck.watchView", next);
    } catch {
      /* ohne Speicher gilt es für die Sitzung */
    }
  };
  const paletteSeq = useRef(0);
  const openPalette = useCallback(() => setPalette(++paletteSeq.current), []);
  // Befehlspalette: Strg+K / Cmd+K überall, „/“ außerhalb von Eingabefeldern
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isPaletteKey(e, e.target) || document.querySelector("dialog[open]:not(.palette)")) return;
      e.preventDefault();
      openPalette();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openPalette]);

  const sortedGroups = useMemo(() => [...groups].sort(byPos), [groups]);
  const lists = useMemo(() => {
    const m: Record<string, WatchItem[]> = { [NONE]: [] };
    for (const g of groups) m[g.id] = [];
    for (const i of items ?? []) (m[containerOf(i)] ??= []).push(i);
    for (const k in m) m[k].sort(byPos);
    return m;
  }, [items, groups]);

  const {
    editing,
    setEditing,
    add,
    remove,
    addGroup,
    renameGroup,
    toggleGroup,
    deleteGroup,
  } = useListActions({
    groups,
    setGroups,
    setItems,
    sortedGroups,
    lists,
    setError,
    loadAll,
    setToast,
    narrow,
  });
  const { activeId, justDropped, dndProps } = useWatchlistDnd({
    items,
    setItems,
    groups,
    setGroups,
    sortedGroups,
    lists,
    setError,
  });

  const shared = useSharedActions({
    userId,
    sharedItems,
    setSharedItems,
    setSharedLists,
    setError,
    loadAll,
    setToast,
    narrow,
  });
  const sharedByList = useMemo(() => {
    const m: Record<string, SharedItem[]> = {};
    for (const i of sharedItems) (m[i.list_id] ??= []).push(i);
    for (const k in m) m[k].sort(byPos);
    return m;
  }, [sharedItems]);
  const shareList = sharedLists.find((l) => l.id === shareOpen);

  const closeToast = useCallback(() => setToast(null), []);

  // ---------- Darstellung ----------
  if (allowed === false)
    return (
      <section className="login">
        <h1>{t("watchlist.noAccessTitle")}</h1>
        <p className="muted">
          {t("watchlist.noAccessText")}
        </p>
      </section>
    );

  const loading = items === null;
  const gridVars = {
    "--cols": gridTemplate(cols, false),
    "--cols-sm": gridTemplate(cols, true),
    "--col-gap": `${COL_GAP}px`,
  } as CSSProperties;
  const market = { quotes, profiles, events, signals };
  const rowProps = (i: WatchItem, container: string) => ({
    ...rowData(i.symbol, i.name, cols, market),
    item: i,
    container,
    style: {},
    onRemove: () => remove(i),
    // Kein Öffnen direkt nach dem Loslassen einer gezogenen Zeile
    onOpen: () => !justDropped() && open(i.symbol),
    narrow,
    editMode,
  });
  const activeItem = activeId
    ? items?.find((i) => i.id === activeId)
    : undefined;
  const activeGroup = activeId?.startsWith("g:")
    ? groups.find((g) => `g:${g.id}` === activeId)
    : undefined;
  const existing = (items ?? []).map((i) => i.symbol);
  const sharedRowProps = (i: SharedItem) => ({
    ...rowData(i.symbol, i.name, cols, market),
    item: i,
    // Nur fremde Einträge kennzeichnen
    by: i.added_by && i.added_by !== userId ? i.added_by_name : null,
    onRemove: () => shared.remove(i),
    onOpen: () => open(i.symbol),
    narrow,
    editMode,
  });
  const page: Route =
    narrow || route === "portfolio" || route === "konto" ? route : "liste";
  const dialogs = (
    <WatchDialogs
      toast={toast}
      onCloseToast={closeToast}
      shareList={shareList}
      userId={userId}
      email={email}
      shared={shared}
      onCloseShare={() => setShareOpen(null)}
      importOpen={importOpen}
      groups={groups}
      items={items ?? []}
      onCloseImport={() => setImportOpen(false)}
      onImported={(text) => {
        setImportOpen(false);
        setToast({ text });
        loadAll();
      }}
    />
  );
  // Navigation und Dialoge bleiben beim Seitenwechsel stehen (gleitende Markierung, Toast bleibt sichtbar);
  // nur der Seiteninhalt wird getauscht und blendet ein
  const frame = (body: ReactNode) => (
    <>
      {!narrow && !loc.symbol && <DeskTabs route={page} go={go} onPalette={openPalette} />}
      <PageView
        id={loc.symbol ? `s/${loc.symbol}` : page === "suche" ? "liste" : page}
        order={loc.symbol ? 3 : page === "portfolio" ? 1 : page === "konto" ? 2 : 0}
      >{body}</PageView>
      {dialogs}
      {palette > 0 && (
        <CommandPalette
          key={palette}
          watch={items ?? []}
          existing={existing}
          onClose={() => setPalette(0)}
          onOpen={open}
          onAdd={add}
          go={go}
          onAddGroup={async () => {
            await addGroup();
            go("liste");
          }}
          onImport={() => setImportOpen(true)}
        />
      )}
      {narrow && !loc.symbol && <BottomNav route={route} go={go} />}
    </>
  );

  if (loc.symbol)
    return frame(
      <>
        <Suspense
          fallback={<div className="detail-loading sk" aria-hidden="true" />}
        >
          <Detail
            key={loc.symbol}
            symbol={loc.symbol}
            quote={quotes[loc.symbol]}
            profile={profiles[loc.symbol]}
            onList={existing.includes(loc.symbol)}
            onBack={back}
            onAdd={() =>
              add({
                symbol: loc.symbol!,
                name: profiles[loc.symbol!]?.name ?? loc.symbol!,
              })
            }
          />
        </Suspense>
      </>
    );

  if (page === "portfolio")
    return frame(
      <>
        <Suspense
          fallback={<div className="detail-loading sk" aria-hidden="true" />}
        >
          <PortfolioPage
            userId={userId}
            narrow={narrow}
            onOpen={open}
            onToast={(text) => setToast({ text })}
          />
        </Suspense>
      </>
    );

  if (page === "konto")
    return frame(
        <AccountPage
          email={email}
          admin={admin}
          cols={cols}
          setCols={setCols}
          onToast={(text) => setToast({ text })}
          onOpen={open}
          onAddGroup={async () => {
            await addGroup();
            go("liste");
          }}
          onImport={() => setImportOpen(true)}
          onSignOut={onSignOut}
        />
    );

  return frame(
    <section>
      <div className={`refreshbar ${refreshing ? "on" : ""}`} aria-hidden="true" />
      <WatchHeader
        narrow={narrow}
        editMode={editMode}
        onToggleEdit={() => setEditMode((e) => !e)}
        onSearch={() => go("suche")}
        onRefresh={() => loadAll()}
        refreshing={refreshing}
        onAdd={add}
        existing={existing}
        onAddGroup={addGroup}
        onImport={() => setImportOpen(true)}
        cols={cols}
        setCols={setCols}
        view={view}
        onToggleView={toggleView}
      />

      {view === "heat" && !loading ? (
        <Heatmap
          sections={[
            ...sortedGroups.map((g) => ({ id: g.id, name: g.name, items: lists[g.id] ?? [] })),
            { id: NONE, name: null, items: lists[NONE] },
            ...sharedLists.map((l) => ({ id: `s:${l.id}`, name: l.name, items: sharedByList[l.id] ?? [] })),
          ]}
          quotes={quotes}
          onOpen={open}
        />
      ) : (
      <div
        className={`watch ${editMode || !narrow ? "editing" : ""} ${refreshing && !loading ? "stale" : ""}`}
        style={gridVars}
        data-testid="watchlist"
        aria-busy={loading}
      >
        {!narrow && <HeaderRow
            cols={cols}
            onWidths={(w, done) => (done ? setCols : previewCols)({ ...cols, widths: { ...cols.widths, ...w } })}
            onReset={(k) => {
              const { [k]: _gone, ...rest } = cols.widths;
              setCols({ ...cols, widths: rest });
            }}
          />}
        {loading ? (
          Array.from({ length: SKELETON_ROWS }, (_, i) => (
            <SkeletonRow key={i} cols={cols} style={{}} narrow={narrow} />
          ))
        ) : (
          <DndContext {...dndProps}>
            <SortableContext
              items={sortedGroups.map((g) => `g:${g.id}`)}
              strategy={verticalListSortingStrategy}
            >
              {sortedGroups.map((g) => (
                <GroupSection
                  key={g.id}
                  group={g}
                  count={lists[g.id]?.length ?? 0}
                  editing={editing === g.id}
                  onToggle={() => toggleGroup(g)}
                  onRename={(name) => renameGroup(g, name)}
                  onStartEdit={() => setEditing(g.id)}
                  onDelete={() => deleteGroup(g)}
                  onShare={
                    admin
                      ? async () => {
                          const id = await shared.shareGroup(g);
                          if (id) setShareOpen(id);
                        }
                      : undefined
                  }
                >
                  <Container
                    id={g.id}
                    list={lists[g.id] ?? []}
                    hidden={g.collapsed}
                  >
                    {(i) => <StockRow key={i.id} {...rowProps(i, g.id)} />}
                  </Container>
                </GroupSection>
              ))}
            </SortableContext>
            {(sortedGroups.length === 0 ||
              lists[NONE].length > 0 ||
              activeItem) && (
              <UngroupedSection list={lists[NONE]} showHead={sortedGroups.length > 0}>
                {(i) => <StockRow key={i.id} {...rowProps(i, NONE)} />}
              </UngroupedSection>
            )}
            {sharedLists.map((l) => (
              <SharedSection
                key={l.id}
                list={l}
                items={sharedByList[l.id] ?? []}
                isOwner={l.owner_id === userId}
                collapsed={!!shared.collapsed[l.id]}
                onToggle={() => shared.toggle(l)}
                onRename={(name) => shared.rename(l, name)}
                onShare={() => setShareOpen(l.id)}
                onAdd={(r) => shared.add(l, r)}
              >
                {(i) => <StaticRow key={i.id} {...sharedRowProps(i)} />}
              </SharedSection>
            ))}
            {(items ?? []).length === 0 && sortedGroups.length === 0 && sharedLists.length === 0 && (
              <p className="empty muted">
                {narrow
                  ? t("watchlist.emptyMobile")
                  : t("watchlist.emptyDesktop")}
              </p>
            )}
            <DragPreview
              row={activeItem && <PlainRow {...rowProps(activeItem, "")} />}
              group={activeGroup}
              gridVars={gridVars}
            />
          </DndContext>
        )}
      </div>
      )}

      {narrow && page === "suche" && (
        <SearchSheet onAdd={add} existing={existing} onClose={back} />
      )}

      <StatusLine error={error} refreshing={refreshing} updated={updated} />
    </section>
  );
}
