import type { ReactNode } from "react";
import type { Route } from "../lib/nav";

const ICONS: Record<Route, ReactNode> = {
  liste: <path d="M4 6h16M4 12h16M4 18h10" />,
  suche: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  portfolio: (
    <>
      <path d="M12 3.5v8.5h8.5" />
      <path d="M20.3 14.5A8.5 8.5 0 1 1 9.5 3.9" />
    </>
  ),
  konto: (
    <>
      <circle cx="12" cy="8.5" r="3.8" />
      <path d="M4.5 20c1.3-3.6 4.2-5.4 7.5-5.4s6.2 1.8 7.5 5.4" />
    </>
  ),
};
const TABS: { route: Route; label: string }[] = [
  { route: "liste", label: "Watchlist" },
  { route: "portfolio", label: "Portfolio" },
  { route: "konto", label: "Konto" },
];

/** Reiter auf dem Desktop: Watchlist und Portfolio. */
export function DeskTabs({ route, go }: { route: Route; go: (r: Route) => void }) {
  return (
    <nav className="desktabs" aria-label="Bereiche">
      {(["liste", "portfolio", "konto"] as const).map((r) => (
        <button
          key={r}
          className={route === r ? "active" : ""}
          aria-current={route === r ? "page" : undefined}
          onClick={() => go(r)}
        >
          {r === "liste"
            ? "Watchlist"
            : r === "portfolio"
              ? "Portfolio"
              : "Konto & Alarme"}
        </button>
      ))}
    </nav>
  );
}

/** Feste Navigation unten auf dem Handy. */
export function BottomNav({ route, go }: { route: Route; go: (r: Route) => void }) {
  // Die Suche gehört zur Watchlist (runder Button dort), deshalb bleibt deren Reiter aktiv
  const active = route === "suche" ? "liste" : route;
  return (
    <nav className="bottomnav" aria-label="Hauptnavigation">
      {TABS.map((t) => (
        <button
          key={t.route}
          className={active === t.route ? "active" : ""}
          aria-current={active === t.route ? "page" : undefined}
          onClick={() => go(t.route)}
        >
          <RouteIcon route={t.route} size={24} />
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}

export function RouteIcon({ route, size }: { route: Route; size: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      {ICONS[route]}
    </svg>
  );
}
