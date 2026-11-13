import {
  useEffect,
  useRef,
  useState,
} from "react";
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
        placeholder="Aktie suchen, z. B. AAPL"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Aktie suchen"
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
                <span className="muted ellipsis">{r.name}</span>
                {existing.includes(r.symbol) && (
                  <span className="muted small inlist">auf der Liste</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
