// Backend for a project on supabase.com: everything through the Management API and the Supabase CLI.
import { spawnSync } from "node:child_process";

const API = process.env.SUPABASE_API_URL || "https://api.supabase.com/v1"; // override only for tests
const SUPABASE_CLI = "supabase@3";

export async function connectHosted({ ask, fail, ok }) {
  const token = await ask("SUPABASE_ACCESS_TOKEN", "Supabase access token (sbp_…)", { secret: true });
  const ref = await ask("SUPABASE_PROJECT_REF", "Supabase project ref (Project Settings → General)", {
    validate: (v) => (/^[a-z0-9]{20}$/.test(v) ? null : "expected the 20-character project ref"),
  });

  async function api(path, { method = "GET", body } = {}) {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) fail(`${method} ${path}: HTTP ${res.status} ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : null;
  }

  const supabaseUrl = `https://${ref}.supabase.co`;
  return {
    supabaseUrl,
    // The cron job calls the functions from inside the database; on supabase.com that is the public URL
    internalUrl: supabaseUrl,
    callbackUrl: `${supabaseUrl}/auth/v1/callback`,

    async check() {
      const project = await api(`/projects/${ref}`);
      if (project.status !== "ACTIVE_HEALTHY") fail(`Project status is ${project.status}; wait until it is active.`);
      ok(`${project.name} (${project.region})`);
      const keys = await api(`/projects/${ref}/api-keys?reveal=true`);
      const key = keys.find((k) => k.type === "publishable")?.api_key ?? keys.find((k) => k.name === "anon")?.api_key;
      if (!key) fail("No publishable (or anon) API key found in the project.");
      return key;
    },

    sql: (query) => api(`/projects/${ref}/database/query`, { method: "POST", body: { query } }),

    async deployFunctions(functions, secrets) {
      await api(`/projects/${ref}/secrets`, {
        method: "POST",
        body: Object.entries(secrets).map(([name, value]) => ({ name, value })),
      });
      ok("secrets set");
      const deploy = spawnSync(
        "npx",
        ["-y", SUPABASE_CLI, "functions", "deploy", ...functions, "--project-ref", ref, "--use-api", "--yes"],
        { stdio: "inherit", env: { ...process.env, SUPABASE_ACCESS_TOKEN: token }, shell: process.platform === "win32" }
      );
      if (deploy.status !== 0) fail("Function deploy failed (see output above).");
      ok(functions.join(", "));
    },

    async configureAuth({ siteUrl, allowList, googleId, googleSecret }) {
      await api(`/projects/${ref}/config/auth`, {
        method: "PATCH",
        body: {
          site_url: siteUrl,
          uri_allow_list: allowList.join(","),
          external_email_enabled: false,
          external_google_enabled: true,
          external_google_client_id: googleId,
          external_google_secret: googleSecret,
          hook_before_user_created_enabled: true,
          hook_before_user_created_uri: "pg-functions://postgres/public/hook_before_user_created",
          oauth_server_enabled: true,
          oauth_server_allow_dynamic_registration: true,
          oauth_server_authorization_path: "/oauth/consent",
        },
      });
      ok("configured");
    },
  };
}
