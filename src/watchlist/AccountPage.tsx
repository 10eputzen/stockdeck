import { lazy, Suspense, type ReactNode } from "react";
import type { Columns } from "../lib/columns";
import { ColumnList } from "../ColumnMenu";
import { LangChoice, ThemeChoice } from "../ThemeSwitch";

const AlertsSection = lazy(() =>
  import("../Alerts").then((m) => ({ default: m.AlertsSection })),
);

export function AccountPage({
  email,
  cols,
  setCols,
  onToast,
  onOpen,
  onAddGroup,
  onImport,
  onSignOut,
  children,
}: {
  email?: string;
  cols: Columns;
  setCols: (c: Columns) => void;
  onToast: (text: string) => void;
  onOpen: (symbol: string) => void;
  onAddGroup: () => void;
  onImport: () => void;
  onSignOut: () => void;
  children?: ReactNode;
}) {
  return (
    <section className="mpage">
      <div className="listhead">
        <h1>Konto</h1>
      </div>
      {email && <p className="muted small">Angemeldet als {email}</p>}
      <Suspense fallback={null}>
        <AlertsSection onToast={onToast} onOpen={onOpen} />
      </Suspense>
      <h2 className="mh2">Liste</h2>
      <div className="mcard">
        <button className="mitem" onClick={onAddGroup}>
          Neue Gruppe anlegen
        </button>
        <button className="mitem" onClick={onImport}>
          TradingView-Liste importieren
        </button>
      </div>
      <h2 className="mh2">Darstellung</h2>
      <ThemeChoice />
      <h2 className="mh2">Sprache</h2>
      <LangChoice />
      <h2 className="mh2">Anzeige</h2>
      <div className="mcard checks" role="group" aria-label="Angezeigte Werte">
        <ColumnList cols={cols} onChange={setCols} mobile />
      </div>
      <div className="mcard">
        <button className="mitem danger" onClick={onSignOut}>
          Abmelden
        </button>
      </div>
      {children}
    </section>
  );
}
