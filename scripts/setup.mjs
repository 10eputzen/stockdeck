#!/usr/bin/env node
// One-command setup for a new Stockdeck instance on a hosted Supabase project.
//
//   npm run setup
//
// Asks for a few values (or reads them from the environment / a setup.env file), then:
//   1. checks access to the Supabase project
//   2. creates the vault secrets for the alerts cron job
//   3. applies all migrations that are not applied yet
//   4. sets the Edge Function secrets and deploys market, alerts and mcp
//   5. configures Auth (Google sign-in, redirect URLs, sign-up hook, OAuth server for MCP)
//   6. adds the first admin to the allowlist
//   7. writes .env for the frontend
//
// Safe to run again: applied migrations are skipped, existing VAPID keys and the cron secret are reused.
// Values: SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF, FINNHUB_API_KEY, GOOGLE_CLIENT_ID,
// GOOGLE_CLIENT_SECRET, ADMIN_EMAIL, SITE_URL (default http://localhost:5173). `--yes` never prompts.

import { spawnSync } from "node:child_process";
import { createECDH, randomBytes } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";

// Behind an HTTP proxy, Node's fetch only uses it with NODE_USE_ENV_PROXY: restart with it
if ((process.env.HTTPS_PROXY || process.env.https_proxy) && !process.env.NODE_USE_ENV_PROXY) {
  const r = spawnSync(process.execPath, ["--disable-warning=UNDICI-EHPA", ...process.argv.slice(1)], {
    stdio: "inherit",
    env: { ...process.env, NODE_USE_ENV_PROXY: "1" },
  });
  process.exit(r.status ?? 1);
}

const API = process.env.SUPABASE_API_URL || "https://api.supabase.com/v1"; // override only for tests
const FUNCTIONS = ["market", "alerts", "mcp"];
const SUPABASE_CLI = "supabase@3";
const yes = process.argv.includes("--yes");

const fail = (msg) => {
  console.error(`\n✘ ${msg}`);
  process.exit(1);
};
const step = (msg) => console.log(`\n▶ ${msg}`);
const ok = (msg) => console.log(`  ✓ ${msg}`);

function parseEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  return out;
}
const readEnvFile = (f) => (existsSync(f) ? parseEnv(readFileSync(f, "utf8")) : {});
const setupFile = readEnvFile("setup.env");
const existingEnv = readEnvFile(".env");

const rl = yes ? null : createInterface({ input: process.stdin, output: process.stdout });
/** Value from environment or setup.env, otherwise a prompt (with default). */
async function ask(name, question, { fallback = "", secret = false, validate } = {}) {
  let value = process.env[name] || setupFile[name] || "";
  while (!value) {
    if (!rl) {
      if (fallback) return fallback;
      fail(`${name} is missing (set it in the environment or in setup.env).`);
    }
    const hint = fallback ? ` [${fallback}]` : "";
    value = (await rl.question(`  ${question}${hint}${secret ? " (input visible)" : ""}: `)).trim() || fallback;
  }
  const error = validate?.(value);
  if (error) fail(`${name}: ${error}`);
  return value;
}

// ---------- values ----------
console.log("Stockdeck setup – connects this checkout to your Supabase project.\n");
console.log("You need: a Supabase project, a personal access token (https://supabase.com/dashboard/account/tokens),");
console.log("a Finnhub API key (https://finnhub.io/dashboard) and a Google OAuth client (see README).\n");

const token = await ask("SUPABASE_ACCESS_TOKEN", "Supabase access token (sbp_…)", { secret: true });
const ref = await ask("SUPABASE_PROJECT_REF", "Supabase project ref (Project Settings → General)", {
  validate: (v) => (/^[a-z0-9]{20}$/.test(v) ? null : "expected the 20-character project ref"),
});
const finnhubKey = await ask("FINNHUB_API_KEY", "Finnhub API key", { secret: true });
const googleId = await ask("GOOGLE_CLIENT_ID", "Google OAuth client ID", {
  validate: (v) => (v.endsWith(".apps.googleusercontent.com") ? null : "expected …apps.googleusercontent.com"),
});
const googleSecret = await ask("GOOGLE_CLIENT_SECRET", "Google OAuth client secret", { secret: true });
const adminEmail = (
  await ask("ADMIN_EMAIL", "Your Google email (first admin)", {
    validate: (v) => (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? null : "not an email address"),
  })
).toLowerCase();
const siteUrl = (
  await ask("SITE_URL", "Public app URL (keep the default for local use)", {
    fallback: "http://localhost:5173",
    validate: (v) => (/^https?:\/\/[^/]+$/.test(v.replace(/\/$/, "")) ? null : "expected e.g. https://my-app.pages.dev"),
  })
).replace(/\/$/, "");
rl?.close();

const supabaseUrl = `https://${ref}.supabase.co`;

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
const sql = (query) => api(`/projects/${ref}/database/query`, { method: "POST", body: { query } });
const lit = (s) => `'${String(s).replaceAll("'", "''")}'`;

// ---------- 1. access ----------
step("Checking the Supabase project");
const project = await api(`/projects/${ref}`);
if (project.status !== "ACTIVE_HEALTHY") fail(`Project status is ${project.status}; wait until it is active.`);
ok(`${project.name} (${project.region})`);
const keys = await api(`/projects/${ref}/api-keys?reveal=true`);
const publishable = keys.find((k) => k.type === "publishable")?.api_key ?? keys.find((k) => k.name === "anon")?.api_key;
if (!publishable) fail("No publishable (or anon) API key found in the project.");

// ---------- 2. vault ----------
step("Vault secrets for the alerts cron job");
const vault = await sql("select name, decrypted_secret from vault.decrypted_secrets where name in ('project_url', 'alerts_cron_secret')");
const vaultValue = (name) => vault.find((v) => v.name === name)?.decrypted_secret;
const cronSecret = vaultValue("alerts_cron_secret") ?? randomBytes(32).toString("hex");
if (!vaultValue("project_url")) await sql(`select vault.create_secret(${lit(supabaseUrl)}, 'project_url')`);
if (!vaultValue("alerts_cron_secret")) await sql(`select vault.create_secret(${lit(cronSecret)}, 'alerts_cron_secret')`);
ok("project_url, alerts_cron_secret");

// ---------- 3. migrations ----------
step("Database migrations");
await sql(`create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text)`);
const applied = new Set((await sql("select version from supabase_migrations.schema_migrations")).map((r) => r.version));
const dir = "supabase/migrations";
for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
  const [version, ...rest] = file.replace(/\.sql$/, "").split("_");
  if (applied.has(version)) continue;
  const body = readFileSync(join(dir, file), "utf8");
  await sql(`begin;\n${body}\n;\ninsert into supabase_migrations.schema_migrations (version, name) values (${lit(version)}, ${lit(rest.join("_"))});\ncommit;`);
  ok(file);
}
ok(`${readdirSync(dir).filter((f) => f.endsWith(".sql")).length} migrations in place`);

// ---------- 4. functions ----------
step("Edge Function secrets and deploy");
let vapidPublic = existingEnv.VITE_VAPID_PUBLIC_KEY;
let vapidPrivate = readEnvFile("supabase/functions/.env").VAPID_PRIVATE_KEY;
if (!vapidPublic || !vapidPrivate) {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  vapidPublic = ecdh.getPublicKey().toString("base64url");
  vapidPrivate = ecdh.getPrivateKey().toString("base64url");
  ok("generated new VAPID keys for web push");
}
const functionSecrets = {
  SITE_URL: siteUrl,
  FINNHUB_API_KEY: finnhubKey,
  VAPID_PUBLIC_KEY: vapidPublic,
  VAPID_PRIVATE_KEY: vapidPrivate,
  VAPID_SUBJECT: `mailto:${adminEmail}`,
  ALERTS_CRON_SECRET: cronSecret,
};
await api(`/projects/${ref}/secrets`, {
  method: "POST",
  body: Object.entries(functionSecrets).map(([name, value]) => ({ name, value })),
});
// Keep a local copy so a re-run reuses the VAPID keys (gitignored)
writeFileSync(
  "supabase/functions/.env",
  Object.entries(functionSecrets).map(([k, v]) => `${k}=${v}`).join("\n") + "\n"
);
ok("secrets set (copy in supabase/functions/.env, not committed)");
const deploy = spawnSync(
  "npx",
  ["-y", SUPABASE_CLI, "functions", "deploy", ...FUNCTIONS, "--project-ref", ref, "--use-api", "--yes"],
  { stdio: "inherit", env: { ...process.env, SUPABASE_ACCESS_TOKEN: token }, shell: process.platform === "win32" }
);
if (deploy.status !== 0) fail("Function deploy failed (see output above).");
ok(FUNCTIONS.join(", "));

// ---------- 5. auth ----------
step("Auth: Google sign-in, redirect URLs, sign-up hook, OAuth server");
const allow = new Set([
  siteUrl,
  `${siteUrl}/oauth/consent**`,
  "http://localhost:5173",
  "http://localhost:5173/oauth/consent**",
]);
const host = new URL(siteUrl).host;
if (!host.startsWith("localhost")) allow.add(`https://*.${host}/**`);
await api(`/projects/${ref}/config/auth`, {
  method: "PATCH",
  body: {
    site_url: siteUrl,
    uri_allow_list: [...allow].join(","),
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

// ---------- 6. admin ----------
step("First admin");
await sql(`insert into public.allowed_emails (email, is_admin) values (${lit(adminEmail)}, true)
  on conflict (email) do update set is_admin = true`);
ok(`${adminEmail} may sign in and invite others`);

// ---------- 7. frontend env ----------
step("Frontend .env");
if (existsSync(".env")) copyFileSync(".env", ".env.bak");
const env = {
  ...existingEnv,
  VITE_SUPABASE_URL: supabaseUrl,
  VITE_SUPABASE_PUBLISHABLE_KEY: publishable,
  VITE_SITE_URL: siteUrl,
  VITE_VAPID_PUBLIC_KEY: vapidPublic,
};
writeFileSync(".env", Object.entries(env).map(([k, v]) => `${k}=${v}`).join("\n") + "\n");
ok(existsSync(".env.bak") ? "written (previous version in .env.bak)" : "written");

console.log(`
✔ Done. One manual step left, in the Google Cloud console:
  OAuth client → Authorized redirect URIs → add  ${supabaseUrl}/auth/v1/callback

Then start the app:
  npm run dev        → http://localhost:5173, sign in with ${adminEmail}
`);
