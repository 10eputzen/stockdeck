import { useTranslation } from "react-i18next";
import { LOCALE } from "../i18n";
import { price } from "../lib/format";
import type { Quote } from "../lib/supabase";
import { breadth, heatLevel } from "./heat";

export type HeatSection = { id: string; name: string | null; items: { symbol: string; name: string | null }[] };

const pctFmt = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2, minimumFractionDigits: 2, signDisplay: "exceptZero" });

/** Kachelansicht: jede Aktie als Feld, eingefärbt nach Tagesveränderung; Klick öffnet die Detailseite. */
export function Heatmap({ sections, quotes, onOpen }: { sections: HeatSection[]; quotes: Record<string, Quote>; onOpen: (symbol: string) => void }) {
  const { t } = useTranslation();
  const all = sections.flatMap((s) => s.items.map((i) => quotes[i.symbol]?.change_pct));
  const b = breadth(all);
  const visible = sections.filter((s) => s.items.length);
  return (
    <div className="heat" data-testid="heatmap">
      <p className="heat-breadth muted small" aria-live="polite">
        <span className="up">▲ {b.up}</span> <span className="down">▼ {b.down}</span>
        {b.flat > 0 && <span> ● {b.flat}</span>}
        {b.avg != null && <span> · {t("heatmap.avg", { pct: `${pctFmt.format(b.avg)} %` })}</span>}
      </p>
      {visible.map((s) => (
          <section key={s.id} className="heat-group" aria-label={s.name ?? t("heatmap.ungrouped")}>
            {visible.length > 1 && <h2 className="heat-title">{s.name ?? t("heatmap.ungrouped")}</h2>}
            <div className="heat-grid">
              {s.items.map((i) => {
                const q = quotes[i.symbol];
                const lvl = heatLevel(q?.change_pct);
                const dir = q && q.change_pct > 0 ? "up" : q && q.change_pct < 0 ? "down" : "flat";
                const style = lvl == null || dir === "flat" ? undefined : { ["--heat" as string]: `${Math.round(12 + lvl * 58)}%` };
                return (
                  <button
                    key={i.symbol}
                    className={`heat-tile ${lvl == null ? "none" : dir}`}
                    style={style}
                    onClick={() => onOpen(i.symbol)}
                    title={i.name ?? i.symbol}
                  >
                    <span className="heat-sym">{i.symbol}</span>
                    <span className="heat-pct num">{q ? `${pctFmt.format(q.change_pct)} %` : "–"}</span>
                    <span className="heat-price num">{q ? price(q.currency).format(q.price) : ""}</span>
                  </button>
                );
              })}
            </div>
          </section>
      ))}
    </div>
  );
}
