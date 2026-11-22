import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "../lib/supabase";
import { useDialogs } from "../ui/useDialogs";

type Entry = { email: string; is_admin: boolean; invited: boolean; has_account: boolean; created_at: string };

/** Fehlercode aus Postgres in einen Text übersetzen. */
function errKey(code?: string) {
  if (code === "22023") return "access.errInvalid";
  if (code === "23505") return "access.errExists";
  if (code === "42501") return "access.errForbidden";
  return "access.errGeneric";
}

/** Zugangsliste (nur Admins): wer sich anmelden darf, Admin-Rolle, Zugang entziehen. Die Datenbank prüft selbst. */
export function AccessSection({ myEmail, onToast }: { myEmail?: string; onToast: (text: string) => void }) {
  const { t } = useTranslation();
  const { confirm, prompt } = useDialogs();
  const [rows, setRows] = useState<Entry[] | null>(null);
  const [busy, setBusy] = useState(false);
  const me = myEmail?.toLowerCase();

  const load = () =>
    supabase.rpc("admin_list_access").then(({ data, error }) => {
      if (error) onToast(t("access.errLoad"));
      setRows(error ? [] : (data as Entry[]));
    });

  useEffect(() => {
    load();
    // nur beim Öffnen der Seite laden; onToast ist nicht stabil
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run(fn: string, args: object, ok: string) {
    setBusy(true);
    const { error } = await supabase.rpc(fn, args);
    setBusy(false);
    onToast(error ? t(errKey(error.code)) : ok);
    await load();
  }

  async function add() {
    const email = (await prompt({ title: t("access.addTitle"), label: t("access.emailLabel"), confirmLabel: t("access.add"), maxLength: 254 }))?.trim();
    if (!email) return;
    await run("admin_grant_access", { p_email: email }, t("access.added", { email }));
  }

  async function toggleAdmin(r: Entry) {
    const ok = await confirm({
      title: r.is_admin ? t("access.demoteTitle", { email: r.email }) : t("access.promoteTitle", { email: r.email }),
      message: r.is_admin ? t("access.demoteMsg") : t("access.promoteMsg"),
      confirmLabel: r.is_admin ? t("access.demote") : t("access.promote"),
    });
    if (ok) await run("admin_set_admin", { p_email: r.email, p_admin: !r.is_admin }, t("access.saved"));
  }

  async function revoke(r: Entry) {
    const ok = await confirm({
      title: t("access.revokeTitle", { email: r.email }),
      message: t("access.revokeMsg"),
      confirmLabel: t("access.revoke"),
      danger: true,
    });
    if (ok) await run("admin_revoke_access", { p_email: r.email }, t("access.revoked", { email: r.email }));
  }

  return (
    <>
      <h2 className="mh2">{t("access.section")}</h2>
      <div className="mcard">
        <p className="mnote">{t("access.hint")}</p>
        {rows?.map((r) => {
          const self = r.email === me;
          return (
            <div className="mitem alrow access-row" key={r.email}>
              <span className="access-email">
                {r.email}
                <span className="muted small">
                  {r.is_admin && <span className="access-tag">{t("access.admin")}</span>}
                  {self ? t("access.you") : r.has_account ? t("access.hasAccount") : t("access.noAccount")}
                  {r.invited && ` · ${t("access.viaInvite")}`}
                </span>
              </span>
              {!self && (
                <>
                  <button className="ghost" onClick={() => toggleAdmin(r)} disabled={busy}>
                    {r.is_admin ? t("access.demote") : t("access.promote")}
                  </button>
                  <button
                    className="ghost icon"
                    onClick={() => revoke(r)}
                    disabled={busy}
                    aria-label={t("access.revokeTitle", { email: r.email })}
                    title={t("access.revoke")}
                  >
                    ✕
                  </button>
                </>
              )}
            </div>
          );
        })}
        <button className="mitem" onClick={add} disabled={busy || rows == null}>
          {t("access.add")}
        </button>
      </div>
    </>
  );
}
