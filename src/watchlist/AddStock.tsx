import {
  useEffect,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { isCrypto } from "../lib/symbols";
import {
  searchSymbols,
  type SearchResult,
} from "../lib/supabase";


export function AddStock({
  onAdd,
  existing,
  autoFocus,
  inline,
}: {
  onAdd: (r: SearchResult) => void;
  existing: string[];
  autoFocus?: boolean;
  inline?: boolean;
}) {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    window.clearTimeout(timer.current);
    if (q.trim().length < 1) return;
    timer.current = window.setTimeout(() => {
      searchSymbols(q)
        .then(setResults)
        .catch(() => setResults([]));
    }, 300);
    return () => window.clearTimeout(timer.current);
  }, [q]);

  return (
    <div className={`add ${inline ? "inline" : ""}`}>
      <input
        type="search"
        placeholder={t("watchlist.searchPlaceholder")}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label={t("watchlist.searchLabel")}
        autoFocus={autoFocus}
        enterKeyHint="search"
      />
      {q.trim() && results.length > 0 && (
        <ul className="results">
          {results.map((r) => (
            <li key={r.symbol}>
              <button
                disabled={existing.includes(r.symbol)}
                onClick={() => {
                  onAdd(r);
                  setQ("");
                  setResults([]);
                }}
              >
                <span className="sym">{r.symbol}</span>
                <span className="muted ellipsis">{isCrypto(r.symbol) ? `${r.name} · ${t("common.crypto")}` : r.name}</span>
                {existing.includes(r.symbol) && (
                  <span className="muted small inlist">{t("watchlist.inList")}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
