#!/usr/bin/env node
// One-command setup for a new Stockdeck instance.
//
//   npm run setup                              # project on supabase.com
//   npm run setup -- --self-hosted <folder>    # self-hosted Supabase (Docker), <folder> = its docker folder
//
// Asks for a few values (or reads them from the environment / a setup.env file), then:
//   1. checks access to Supabase
//   2. creates the vault secrets for the alerts cron job
//   3. applies all migrations that are not applied yet
//   4. sets the Edge Function secrets and deploys market, alerts and mcp
//   5. configures Auth (Google sign-in, redirect URLs, sign-up hook, OAuth server for MCP)
//   6. adds the first admin to the allowlist
//   7. writes .env for the frontend
//
// Safe to run again: applied migrations are skipped, existing VAPID keys and the cron secret are reused.
// Values: FINNHUB_API_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, ADMIN_EMAIL, SITE_URL (default
// http://localhost:5173); for supabase.com also SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF,
// self-hosted SUPABASE_SELF_HOSTED_DIR (or the folder after --self-hosted). `--yes` never prompts.
// Backends: scripts/setup/hosted.mjs (Management API) and scripts/setup/self-hosted.mjs (Docker Compose).

import { spawnSync } from "node:child_process";
import { createECDH, randomBytes } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { connectHosted } from "./setup/hosted.mjs";
import { connectSelfHosted } from "./setup/self-hosted.mjs";

// Behind an HTTP proxy, Node's fetch only uses it with NODE_USE_ENV_PROXY: restart with it
if ((process.env.HTTPS_PROXY || process.env.https_proxy) && !process.env.NODE_USE_ENV_PROXY) {
  const r = spawnSync(process.execPath, ["--disable-warning=UNDICI-EHPA", ...process.argv.slice(1)], {
    stdio: "inherit",
    env: { ...process.env, NODE_USE_ENV_PROXY: "1" },
  });
  process.exit(r.status ?? 1);
}

const FUNCTIONS = ["market", "alerts", "mcp"];
const args = process.argv.slice(2);
const yes = args.includes("--yes");
const selfHostedAt = args.indexOf("--self-hosted");
const selfHosted = selfHostedAt >= 0 || !!process.env.SUPABASE_SELF_HOSTED_DIR;
const selfHostedDir = selfHostedAt >= 0 && args[selfHostedAt + 1] && !args[selfHostedAt + 1].startsWith("--") ? args[selfHostedAt + 1] : "";

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
console.log(`Stockdeck setup – connects this checkout to ${selfHosted ? "your self-hosted Supabase" : "your Supabase project"}.\n`);
console.log(selfHosted
  ? "You need: the self-hosted Supabase stack running (docker compose up -d),"
  : "You need: a Supabase project, a personal access token (https://supabase.com/dashboard/account/tokens),");
console.log("a Finnhub API key (https://finnhub.io/dashboard) and a Google OAuth client (see README).\n");

const ctx = { ask, fail, ok, parseEnv, dirArg: selfHostedDir };
const backend = selfHosted ? await connectSelfHosted(ctx) : await connectHosted(ctx);
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

const { supabaseUrl, sql } = backend;
const lit = (s) => `'${String(s).replaceAll("'", "''")}'`;

// ---------- 1. access ----------
step("Checking Supabase");
const publishable = await backend.check();

// ---------- 2. vault ----------
step("Vault secrets for the alerts cron job");
const vault = await sql("select name, decrypted_secret from vault.decrypted_secrets where name in ('project_url', 'alerts_cron_secret')");
const vaultValue = (name) => vault.find((v) => v.name === name)?.decrypted_secret;
const cronSecret = vaultValue("alerts_cron_secret") ?? randomBytes(32).toString("hex");
if (!vaultValue("project_url")) await sql(`select vault.create_secret(${lit(backend.internalUrl)}, 'project_url')`);
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
// Keep a local copy so a re-run reuses the VAPID keys (gitignored)
writeFileSync(
  "supabase/functions/.env",
  Object.entries(functionSecrets).map(([k, v]) => `${k}=${v}`).join("\n") + "\n"
);
await backend.deployFunctions(FUNCTIONS, functionSecrets);

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
await backend.configureAuth({ siteUrl, allowList: [...allow], googleId, googleSecret });

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
  OAuth client → Authorized redirect URIs → add  ${backend.callbackUrl}

Then start the app:
  npm run dev        → http://localhost:5173, sign in with ${adminEmail}
`);
