import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LOCALE } from "../i18n";
import { createApiKey, listApiKeys, MCP_URL, revokeApiKey, type ApiKey } from "../lib/apiKeys";
import { useDialogs } from "../ui/useDialogs";

const day = (iso: string) =>
  new Date(iso).toLocaleDateString(LOCALE, { day: "2-digit", month: "2-digit", year: "numeric" });

/** KI-Zugriff (MCP): Adresse, API-Keys anlegen (Klartext nur einmal sichtbar) und widerrufen. */
export function ApiKeysSection({ onToast }: { onToast: (text: string) => void }) {
  const { t } = useTranslation();
  const { confirm, prompt } = useDialogs();
  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [fresh, setFresh] = useState<{ label: string; key: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    listApiKeys()
      .then(setKeys)
      .catch(() => {
        setKeys([]);
        onToast(t("apiKeys.errLoad"));
      });

  useEffect(() => {
    load();
    // nur beim Öffnen der Seite laden; onToast ist nicht stabil
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      onToast(t("apiKeys.copied"));
    } catch {
      onToast(t("apiKeys.copyFailed"));
    }
  }

  async function create() {
    const label = await prompt({
      title: t("apiKeys.createTitle"),
      label: t("apiKeys.labelField"),
      initial: "Claude Code",
      confirmLabel: t("apiKeys.create"),
      maxLength: 60,
    });
    if (!label?.trim()) return;
    setBusy(true);
    try {
      const key = await createApiKey(label.trim());
      setFresh({ label: label.trim(), key });
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      onToast(msg.includes("too many") ? t("apiKeys.errTooMany") : t("apiKeys.errCreate"));
    }
    setBusy(false);
  }

  async function revoke(k: ApiKey) {
    const ok = await confirm({
      title: t("apiKeys.revokeTitle", { label: k.label }),
      message: t("apiKeys.revokeMsg"),
      confirmLabel: t("apiKeys.revoke"),
      danger: true,
    });
    if (!ok) return;
    try {
      await revokeApiKey(k.id);
      onToast(t("apiKeys.revoked", { label: k.label }));
    } catch {
      onToast(t("apiKeys.errRevoke"));
    }
    load();
  }

  return (
    <>
      <h2 className="mh2">{t("apiKeys.section")}</h2>
      <div className="mcard">
        <div className="mitem alrow">
          <code className="apikey-val">{MCP_URL}</code>
          <button className="ghost" onClick={() => copy(MCP_URL)}>
            {t("apiKeys.copy")}
          </button>
        </div>
        <p className="mnote">{t("apiKeys.hint")}</p>
      </div>

      <div className="mcard">
        {fresh && (
          <div className="mitem apikey-fresh" role="status">
            <strong>{t("apiKeys.freshTitle", { label: fresh.label })}</strong>
            <div className="alrow">
              <code className="apikey-val">{fresh.key}</code>
              <button className="primary" onClick={() => copy(fresh.key)}>
                {t("apiKeys.copy")}
              </button>
            </div>
            <span className="muted small">{t("apiKeys.freshHint")}</span>
            <button className="ghost" onClick={() => setFresh(null)}>
              {t("apiKeys.done")}
            </button>
          </div>
        )}
        {keys?.length === 0 && !fresh && <p className="mnote">{t("apiKeys.none")}</p>}
        {keys?.map((k) => (
          <div className="mitem alrow" key={k.id}>
            <span className="apikey-label">
              {k.label}
              <span className="muted small">
                {" · "}
                {t("apiKeys.createdOn", { date: day(k.created_at) })}
                {" · "}
                {k.last_used_at ? t("apiKeys.lastUsed", { date: day(k.last_used_at) }) : t("apiKeys.neverUsed")}
              </span>
            </span>
            <button
              className="ghost icon"
              onClick={() => revoke(k)}
              aria-label={t("apiKeys.revokeTitle", { label: k.label })}
              title={t("apiKeys.revoke")}
            >
              ✕
            </button>
          </div>
        ))}
        <button className="mitem" onClick={create} disabled={busy || keys == null}>
          {t("apiKeys.create")}
        </button>
      </div>
    </>
  );
}
