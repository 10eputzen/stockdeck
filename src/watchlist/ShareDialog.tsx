import { useEffect, useRef, useState } from "react";
import type { SharedList } from "../lib/supabase";

const APP_URL = import.meta.env.VITE_SITE_URL || location.origin;

/** Teilen verwalten: Besitzer lädt ein und entfernt Personen, Mitglieder sehen, wer dabei ist. */
export function ShareDialog({
  list,
  isOwner,
  onInvite,
  onRemoveMember,
  onUnshare,
  onLeave,
  onClose,
}: {
  list: SharedList;
  isOwner: boolean;
  onInvite: (email: string) => Promise<string | null>;
  onRemoveMember: (email: string) => void;
  onUnshare: () => Promise<boolean>;
  onLeave: () => Promise<boolean>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);

  async function invite() {
    const e = email.trim();
    if (!e) return;
    setBusy(true);
    const err = await onInvite(e);
    setBusy(false);
    if (err) return setMsg({ text: err, error: true });
    setEmail("");
    setMsg({ text: `${e.toLowerCase()} eingeladen. Schick ihr oder ihm den Link zur App.` });
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(APP_URL);
      setMsg({ text: "Link kopiert." });
    } catch {
      setMsg({ text: APP_URL });
    }
  }

  return (
    <dialog ref={dialog} className="dialog share" onClose={onClose} aria-labelledby="share-title">
      <h2 id="share-title">„{list.name}“ teilen</h2>
      <p className="muted small">
        {isOwner
          ? "Eingeladene melden sich mit diesem Google-Konto in Stockdeck an und können die Liste mit dir bearbeiten. Dein Portfolio und deine übrigen Gruppen sehen sie nicht. Stockdeck verschickt keine Mail."
          : `${list.owner_name} hat diese Liste mit dir geteilt. Alle hier können Werte hinzufügen und entfernen.`}
      </p>

      {isOwner && (
        <form
          className="invite"
          onSubmit={(e) => {
            e.preventDefault();
            invite();
          }}
        >
          <input
            type="email"
            placeholder="E-Mail-Adresse (Google-Konto)"
            aria-label="E-Mail-Adresse"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={254}
            autoComplete="off"
            required
          />
          <button className="primary" disabled={busy || !email.trim()}>
            Einladen
          </button>
        </form>
      )}

      <ul className="members">
        <li>
          <span className="ellipsis">{isOwner ? "Du" : list.owner_name}</span>
          <span className="muted small">Besitzer</span>
        </li>
        {list.members.map((m) => (
          <li key={m.email}>
            <span className="ellipsis">{m.email}</span>
            {isOwner ? (
              <button
                className="ghost icon danger"
                aria-label={`${m.email} entfernen`}
                title="Entfernen"
                onClick={() => onRemoveMember(m.email)}
              >
                ×
              </button>
            ) : (
              <span className="muted small">Mitglied</span>
            )}
          </li>
        ))}
      </ul>

      <p className={`small ${msg?.error ? "error" : "muted"}`} aria-live="polite">
        {msg?.text ?? " "}
      </p>

      <div className="dialog-actions">
        {isOwner ? (
          <button
            className="ghost danger-text"
            style={{ marginRight: "auto" }}
            onClick={async () => (await onUnshare()) && dialog.current?.close()}
          >
            Teilen beenden
          </button>
        ) : (
          <button
            className="ghost danger-text"
            style={{ marginRight: "auto" }}
            onClick={async () => (await onLeave()) && dialog.current?.close()}
          >
            Liste verlassen
          </button>
        )}
        {isOwner && (
          <button className="ghost" onClick={copyLink}>
            Link kopieren
          </button>
        )}
        <button className="ghost" onClick={() => dialog.current?.close()}>
          Schließen
        </button>
      </div>
    </dialog>
  );
}
