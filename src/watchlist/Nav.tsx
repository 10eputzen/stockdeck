import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { t } from "../i18n";
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
  { route: "liste", label: t("watchlist.tabWatchlist") },
  { route: "portfolio", label: t("watchlist.tabPortfolio") },
  { route: "konto", label: t("watchlist.tabAccount") },
];

/** Reiter auf dem Desktop: Watchlist und Portfolio. */
export function DeskTabs({ route, go }: { route: Route; go: (r: Route) => void }) {
  const { t } = useTranslation();
  const nav = useRef<HTMLElement>(null);
  const bar = useRef<HTMLSpanElement>(null);
  // Markierung unter dem aktiven Reiter: Lage und Breite messen, damit sie zwischen unterschiedlich breiten Reitern gleitet
  useLayoutEffect(() => {
    const el = nav.current;
    if (!el) return;
    const place = () => {
      const btn = el.querySelector<HTMLElement>("button.active");
      if (!btn || !bar.current) return;
      bar.current.style.transform = `translateX(${btn.offsetLeft}px)`;
      bar.current.style.width = `${btn.offsetWidth}px`;
    };
    place();
    const ro = new ResizeObserver(place);
    el.querySelectorAll("button").forEach((b) => ro.observe(b));
    return () => ro.disconnect();
  }, [route]);
  return (
    <nav className="desktabs" aria-label={t("watchlist.sectionsNav")} ref={nav}>
      <span className="navind" ref={bar} aria-hidden="true" />
      {(["liste", "portfolio", "konto"] as const).map((r) => (
        <button
          key={r}
          className={route === r ? "active" : ""}
          aria-current={route === r ? "page" : undefined}
          onClick={() => go(r)}
        >
          {r === "liste"
            ? t("watchlist.tabWatchlist")
            : r === "portfolio"
              ? t("watchlist.tabPortfolio")
              : t("watchlist.tabAccountAlerts")}
        </button>
      ))}
    </nav>
  );
}

/** Feste Navigation unten auf dem Handy. */
export function BottomNav({ route, go }: { route: Route; go: (r: Route) => void }) {
  const { t } = useTranslation();
  // Die Suche gehört zur Watchlist (runder Button dort), deshalb bleibt deren Reiter aktiv
  const active = route === "suche" ? "liste" : route;
  const index = TABS.findIndex((tab) => tab.route === active);
  return (
    <nav className="bottomnav" aria-label={t("watchlist.mainNav")}>
      <span className="navind" style={{ "--i": index } as CSSProperties} aria-hidden="true" />
      {TABS.map((tab) => (
        <button
          key={tab.route}
          className={active === tab.route ? "active" : ""}
          aria-current={active === tab.route ? "page" : undefined}
          onClick={() => go(tab.route)}
        >
          <RouteIcon route={tab.route} size={24} />
          <span>{tab.label}</span>
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
