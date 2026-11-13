import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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
    setMsg({ text: t("watchlist.invitedMsg", { email: e.toLowerCase() }) });
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(APP_URL);
      setMsg({ text: t("watchlist.linkCopied") });
    } catch {
      setMsg({ text: APP_URL });
    }
  }

  return (
    <dialog ref={dialog} className="dialog share" onClose={onClose} aria-labelledby="share-title">
      <h2 id="share-title">{t("watchlist.shareDialogTitle", { name: list.name })}</h2>
      <p className="muted small">
        {isOwner
          ? t("watchlist.shareOwnerHint")
          : t("watchlist.shareMemberHint", { owner: list.owner_name })}
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
            placeholder={t("watchlist.emailPlaceholder")}
            aria-label={t("watchlist.emailLabel")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={254}
            autoComplete="off"
            required
          />
          <button className="primary" disabled={busy || !email.trim()}>
            {t("watchlist.invite")}
          </button>
        </form>
      )}

      <ul className="members">
        <li>
          <span className="ellipsis">{isOwner ? t("watchlist.you") : list.owner_name}</span>
          <span className="muted small">{t("watchlist.owner")}</span>
        </li>
        {list.members.map((m) => (
          <li key={m.email}>
            <span className="ellipsis">{m.email}</span>
            {isOwner ? (
              <button
                className="ghost icon danger"
                aria-label={t("watchlist.removeMemberAria", { email: m.email })}
                title={t("watchlist.removeMemberTitle")}
                onClick={() => onRemoveMember(m.email)}
              >
                ×
              </button>
            ) : (
              <span className="muted small">{t("watchlist.member")}</span>
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
            {t("watchlist.stopSharing")}
          </button>
        ) : (
          <button
            className="ghost danger-text"
            style={{ marginRight: "auto" }}
            onClick={async () => (await onLeave()) && dialog.current?.close()}
          >
            {t("watchlist.leaveList")}
          </button>
        )}
        {isOwner && (
          <button className="ghost" onClick={copyLink}>
            {t("watchlist.copyLink")}
          </button>
        )}
        <button className="ghost" onClick={() => dialog.current?.close()}>
          {t("watchlist.close")}
        </button>
      </div>
    </dialog>
  );
}
