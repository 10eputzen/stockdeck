import { lazy, Suspense, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  return (
    <section className="mpage">
      <div className="listhead">
        <h1>{t("watchlist.accountTitle")}</h1>
      </div>
      {email && <p className="muted small">{t("watchlist.signedInAs", { email })}</p>}
      <Suspense fallback={null}>
        <AlertsSection onToast={onToast} onOpen={onOpen} />
      </Suspense>
      <h2 className="mh2">{t("watchlist.listSection")}</h2>
      <div className="mcard">
        <button className="mitem" onClick={onAddGroup}>
          {t("watchlist.addGroup")}
        </button>
        <button className="mitem" onClick={onImport}>
          {t("watchlist.importTradingView")}
        </button>
      </div>
      <h2 className="mh2">{t("watchlist.appearanceSection")}</h2>
      <ThemeChoice />
      <h2 className="mh2">{t("watchlist.languageSection")}</h2>
      <LangChoice />
      <h2 className="mh2">{t("watchlist.displaySection")}</h2>
      <div className="mcard checks" role="group" aria-label={t("watchlist.displayedValues")}>
        <ColumnList cols={cols} onChange={setCols} mobile />
      </div>
      <div className="mcard">
        <button className="mitem danger" onClick={onSignOut}>
          {t("watchlist.signOut")}
        </button>
      </div>
      {children}
    </section>
  );
}
