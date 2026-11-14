import { ImportDialog } from "../ImportDialog";
import type { Group, SharedList, WatchItem } from "../lib/supabase";
import type { Route } from "../lib/nav";
import { Toast, type ToastState } from "../Toast";
import { BottomNav } from "./Nav";
import { ShareDialog } from "./ShareDialog";
import type { useSharedActions } from "./useSharedActions";

/** Toast, Teilen- und Import-Dialog sowie die Handy-Navigation; auf jeder Seite gleich. */
export function WatchDialogs({
  toast,
  onCloseToast,
  shareList,
  userId,
  email,
  shared,
  onCloseShare,
  importOpen,
  groups,
  items,
  onCloseImport,
  onImported,
  showNav,
  route,
  go,
}: {
  toast: ToastState;
  onCloseToast: () => void;
  shareList?: SharedList;
  userId: string;
  email?: string;
  shared: ReturnType<typeof useSharedActions>;
  onCloseShare: () => void;
  importOpen: boolean;
  groups: Group[];
  items: WatchItem[];
  onCloseImport: () => void;
  onImported: (text: string) => void;
  showNav: boolean;
  route: Route;
  go: (r: Route) => void;
}) {
  return (
    <>
      <Toast toast={toast} onClose={onCloseToast} />
      {shareList && (
        <ShareDialog
          list={shareList}
          isOwner={shareList.owner_id === userId}
          onInvite={(e) => shared.invite(shareList, e)}
          onRemoveMember={(e) => shared.removeMember(shareList, e)}
          onUnshare={() => shared.unshare(shareList)}
          onLeave={() => shared.leave(shareList, email ?? "")}
          onClose={onCloseShare}
        />
      )}
      {importOpen && (
        <ImportDialog groups={groups} items={items} onClose={onCloseImport} onDone={onImported} />
      )}
      {showNav && <BottomNav route={route} go={go} />}
    </>
  );
}
