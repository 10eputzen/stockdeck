import { DndContext, DragOverlay } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  lazy,
  Suspense,
  useCallback,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { useTranslation } from "react-i18next";
import { ImportDialog } from "./ImportDialog";
import { COL_GAP, gridTemplate, useColumns } from "./lib/columns";
import type { SharedItem, WatchItem } from "./lib/supabase";
import { earningsBadge, earningsLong, earningsShort } from "./lib/events";
import { signalBadge } from "./lib/signals";
import { time } from "./lib/format";
import { useLocation, useNarrow, type Route } from "./lib/nav";
import { useWatchlistData } from "./watchlist/useWatchlistData";
import { useWatchlistDnd } from "./watchlist/useWatchlistDnd";
import { useListActions } from "./watchlist/useListActions";
import { byPos, containerOf, NONE } from "./watchlist/model";
import { BottomNav, DeskTabs } from "./watchlist/Nav";
import { Container, GroupSection, HeaderRow } from "./watchlist/Groups";
import { SearchSheet, WatchHeader } from "./watchlist/Header";
import { AccountPage } from "./watchlist/AccountPage";
import { useSharedActions } from "./watchlist/useSharedActions";
import { SharedSection } from "./watchlist/SharedSection";
import { ShareDialog } from "./watchlist/ShareDialog";
import {
  PlainRow,
  SkeletonRow,
  StaticRow,
  StockRow,
} from "./parts";
import { Toast, type ToastState } from "./Toast";

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
  const rowProps = (i: WatchItem, container: string) => ({
    item: i,
    container,
    cols,
    style: {},
    q: quotes[i.symbol],
    logoUrl: profiles[i.symbol]?.logo_url,
    name: profiles[i.symbol]?.name ?? i.name,
    badge: earningsBadge(events[i.symbol]),
    earn: earningsShort(events[i.symbol]),
    earnTitle: events[i.symbol]?.next_date ? earningsLong(events[i.symbol]) : undefined,
    signal: cols.analyst
      ? signalBadge(signals[i.symbol], quotes[i.symbol])
      : null,
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
    item: i,
    cols,
    q: quotes[i.symbol],
    logoUrl: profiles[i.symbol]?.logo_url,
    name: profiles[i.symbol]?.name ?? i.name,
    badge: earningsBadge(events[i.symbol]),
    earn: earningsShort(events[i.symbol]),
    earnTitle: events[i.symbol]?.next_date ? earningsLong(events[i.symbol]) : undefined,
    signal: cols.analyst ? signalBadge(signals[i.symbol], quotes[i.symbol]) : null,
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
    <>
      <Toast toast={toast} onClose={closeToast} />
      {shareList && (
        <ShareDialog
          list={shareList}
          isOwner={shareList.owner_id === userId}
          onInvite={(e) => shared.invite(shareList, e)}
          onRemoveMember={(e) => shared.removeMember(shareList, e)}
          onUnshare={() => shared.unshare(shareList)}
          onLeave={() => shared.leave(shareList, email ?? "")}
          onClose={() => setShareOpen(null)}
        />
      )}
      {importOpen && (
        <ImportDialog
          groups={groups}
          items={items ?? []}
          onClose={() => setImportOpen(false)}
          onDone={(text) => {
            setImportOpen(false);
            setToast({ text });
            loadAll();
          }}
        />
      )}
      {narrow && !loc.symbol && <BottomNav route={route} go={go} />}
    </>
  );
  const deskTabs = !narrow && <DeskTabs route={page} go={go} />;

  if (loc.symbol)
    return (
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
        {dialogs}
      </>
    );

  if (page === "portfolio")
    return (
      <>
        {deskTabs}
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
        {dialogs}
      </>
    );

  if (page === "konto")
    return (
      <>
        {deskTabs}
        <AccountPage
          email={email}
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
        >
          {dialogs}
        </AccountPage>
      </>
    );

  return (
    <section>
      <div className={`refreshbar ${refreshing ? "on" : ""}`} aria-hidden="true" />
      {deskTabs}
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
      />

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
              <section className="group">
                {sortedGroups.length > 0 && (
                  <div className="grouphead">
                    <span className="groupname static">{t("watchlist.ungrouped")}</span>
                    <span className="muted small-count">
                      {lists[NONE].length}
                    </span>
                  </div>
                )}
                <Container id={NONE} list={lists[NONE]}>
                  {(i) => <StockRow key={i.id} {...rowProps(i, NONE)} />}
                </Container>
              </section>
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
            <DragOverlay dropAnimation={null}>
              {activeItem ? (
                <div className="overlay" style={gridVars}>
                  <PlainRow {...rowProps(activeItem, "")} />
                </div>
              ) : activeGroup ? (
                <div className="overlay grouphead">
                  <span className="groupname static">{activeGroup.name}</span>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>

      {narrow && page === "suche" && (
        <SearchSheet onAdd={add} existing={existing} onClose={back} />
      )}

      {/* Status unter der Liste, damit Meldungen nichts verschieben */}
      <p className={`small ${error ? "error" : "muted"}`}>
        {error ??
          (refreshing
            ? t("watchlist.refreshing")
            : updated
            ? t("watchlist.updatedAt", { time: time.format(updated) })
            : " ")}
      </p>
      {dialogs}
    </section>
  );
}
