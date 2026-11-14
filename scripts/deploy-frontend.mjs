#!/usr/bin/env node
// Einziger Weg für einen manuellen Frontend-Deploy (Cloud-Thread oder PC):
//   node scripts/deploy-frontend.mjs            → bauen, prüfen, deployen, live testen
//   node scripts/deploy-frontend.mjs --check    → nur den Live-Test gegen die Produktions-URL
//
// Bricht ab, wenn Supabase-Werte fehlen, das Bundle nicht auf das Projekt zeigt
// oder die Live-Seite Konsolenfehler oder -warnungen zeigt.
//
// Instanzwerte stehen nicht im Repo. Reihenfolge: Umgebung, dann .env.deploy und .env (beide gitignored),
// dann – wenn STOCKDECK_GCP_PROJECT (Umgebung oder .env.deploy) gesetzt ist – das Secret stockdeck-instance-env (dotenv-Format) im
// Secret Manager dieses GCP-Projekts. Benötigt:
//   VITE_SUPABASE_URL, VITE_SITE_URL, VITE_VAPID_PUBLIC_KEY, CLOUDFLARE_ACCOUNT_ID, optional PAGES_PROJECT (Standard stockdeck)
// Tokens: SUPABASE_ACCESS_TOKEN (oder VITE_SUPABASE_PUBLISHABLE_KEY direkt) und CLOUDFLARE_API_TOKEN, sonst die Secrets
// supabase-access-token und stockdeck-cf-pages-token aus demselben Secret Manager. Werden nie ausgegeben und nie gespeichert.

import { execFileSync, execSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

// Hinter einem Proxy (Cloud-Thread) nutzt fetch ihn nur mit NODE_USE_ENV_PROXY: dann sich selbst damit neu starten
if ((process.env.HTTPS_PROXY || process.env.https_proxy) && !process.env.NODE_USE_ENV_PROXY) {
  const r = spawnSync(process.execPath, ["--disable-warning=UNDICI-EHPA", ...process.argv.slice(1)], {
    stdio: "inherit",
    env: { ...process.env, NODE_USE_ENV_PROXY: "1" },
  });
  process.exit(r.status ?? 1);
}

const fail = (msg) => {
  console.error(`\n✘ ${msg}`);
  process.exit(1);
};
const step = (msg) => console.log(`\n▶ ${msg}`);

/** Einfaches dotenv: KEY=wert je Zeile, # Kommentare, optionale Anführungszeichen. */
function parseEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  return out;
}

const fileEnv = Object.assign(
  {},
  ...[".env", ".env.deploy"].filter((f) => existsSync(f)).map((f) => parseEnv(readFileSync(f, "utf8")))
);
const GCP_PROJECT = process.env.STOCKDECK_GCP_PROJECT || fileEnv.STOCKDECK_GCP_PROJECT || "";
const REQUIRED = ["VITE_SUPABASE_URL", "VITE_SITE_URL", "VITE_VAPID_PUBLIC_KEY", "CLOUDFLARE_ACCOUNT_ID"];
const missing = REQUIRED.some((k) => !process.env[k] && !fileEnv[k]);
const smEnv = GCP_PROJECT && missing ? parseEnv(await secret("stockdeck-instance-env", { optional: true })) : {};
/** Wert aus Umgebung, Dateien oder Secret Manager (in dieser Reihenfolge). */
const conf = (name, fallback) => process.env[name] || fileEnv[name] || smEnv[name] || fallback || "";

const SUPABASE_URL = conf("VITE_SUPABASE_URL").replace(/\/$/, "");
const SITE_URL = conf("VITE_SITE_URL").replace(/\/$/, "");
const VAPID_PUBLIC_KEY = conf("VITE_VAPID_PUBLIC_KEY");
const CF_ACCOUNT_ID = conf("CLOUDFLARE_ACCOUNT_ID");
const PAGES_PROJECT = conf("PAGES_PROJECT", "stockdeck");
const REF = SUPABASE_URL.match(/^https:\/\/([a-z0-9]+)\.supabase\.co$/)?.[1];
const LIVE_URL = `${SITE_URL}/`;
if (!REF) fail("VITE_SUPABASE_URL fehlt oder ist keine https://<ref>.supabase.co-Adresse.");
if (!SITE_URL.startsWith("https://")) fail("VITE_SITE_URL fehlt (öffentliche App-URL).");
// Von Chrome erkannte Permissions-Policy-Features (Auswahl); Unbekanntes erzeugt eine Konsolenwarnung.
const KNOWN_FEATURES = new Set([
  "accelerometer", "autoplay", "bluetooth", "camera", "clipboard-read", "clipboard-write", "display-capture",
  "encrypted-media", "fullscreen", "gamepad", "geolocation", "gyroscope", "hid", "idle-detection", "magnetometer",
  "microphone", "midi", "payment", "picture-in-picture", "publickey-credentials-get", "screen-wake-lock", "serial",
  "usb", "web-share", "xr-spatial-tracking",
]);

/** Secret aus dem Secret Manager; in Cloud-Threads authentifiziert der Proxy, am PC gcloud. */
async function secret(name, { optional = false } = {}) {
  if (!GCP_PROJECT) fail(`Secret ${name} nötig, aber STOCKDECK_GCP_PROJECT ist nicht gesetzt (oder Wert per Umgebung setzen).`);
  const url = `https://secretmanager.googleapis.com/v1/projects/${GCP_PROJECT}/secrets/${name}/versions/latest:access`;
  let res = await fetch(url);
  if (res.status === 401 || res.status === 403) {
    let token;
    try {
      token = execSync("gcloud auth print-access-token", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    } catch {
      if (optional) return "";
      fail(`Secret ${name}: kein Zugriff (${res.status}) und kein gcloud-Login.`);
    }
    res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  }
  if (optional && !res.ok) {
    console.log(`  Secret ${name} nicht lesbar (HTTP ${res.status}), weiter ohne.`);
    return "";
  }
  if (!res.ok) fail(`Secret ${name}: HTTP ${res.status} (Token stattdessen per Umgebungsvariable setzen?)`);
  const data = await res.json();
  return Buffer.from(data.payload.data, "base64").toString("utf8").trim();
}

async function publishableKey() {
  if (conf("VITE_SUPABASE_PUBLISHABLE_KEY")) return conf("VITE_SUPABASE_PUBLISHABLE_KEY");
  const token = conf("SUPABASE_ACCESS_TOKEN") || (await secret("supabase-access-token"));
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) fail(`Supabase-API-Keys: HTTP ${res.status}`);
  const key = (await res.json()).find((k) => k.type === "publishable")?.api_key;
  if (!key?.startsWith("sb_publishable_")) fail("Kein publishable Key im Supabase-Projekt gefunden.");
  return key;
}

function bundleCheck(key) {
  const dir = "dist/assets";
  const js = readdirSync(dir).filter((f) => f.endsWith(".js")).map((f) => readFileSync(join(dir, f), "utf8")).join("\n");
  if (!js.includes(SUPABASE_URL)) fail(`Bundle enthält ${SUPABASE_URL} nicht – Build ohne VITE_SUPABASE_URL?`);
  if (!js.includes(key)) fail("Bundle enthält den publishable Key nicht – Build ohne VITE_SUPABASE_PUBLISHABLE_KEY?");
  if (!js.includes(VAPID_PUBLIC_KEY)) fail("Bundle enthält den VAPID-Schlüssel nicht – Build ohne VITE_VAPID_PUBLIC_KEY?");
  if (!readFileSync("dist/_headers", "utf8").includes(SUPABASE_URL)) fail("dist/_headers: CSP ohne Supabase-URL.");
  console.log("  Bundle zeigt auf das richtige Supabase-Projekt.");
}

/** Lädt die Seite in Chromium und sammelt alles, was in der Konsole landet (auch Browser-Meldungen wie Header-Warnungen). */
async function smokeTest(url, attempts = 1) {
  for (let i = 1; ; i++) {
    const problems = await collectProblems(url);
    if (!problems.length) return console.log(`  ${url}: lädt, Konsole ohne Fehler und Warnungen.`);
    if (i >= attempts) fail(`Live-Test ${url} fehlgeschlagen:\n  - ${problems.join("\n  - ")}`);
    console.log(`  Versuch ${i}: noch alte Version oder Fehler, neuer Versuch in 10 s …`);
    await new Promise((r) => setTimeout(r, 10_000));
  }
}

async function collectProblems(url) {
  let chromium;
  try {
    ({ chromium } = createRequire(import.meta.url)("playwright"));
  } catch {
    fail("Playwright fehlt – Live-Test nicht möglich. Deploy ist raus, aber ungeprüft!");
  }
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const problems = [];
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") problems.push(`console.${m.type()}: ${m.text()}`);
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Log.enable");
  cdp.on("Log.entryAdded", ({ entry }) => {
    if (entry.level === "error" || entry.level === "warning") problems.push(`browser.${entry.level}: ${entry.text}`);
  });
  const res = await page.goto(`${url}?smoke=${Date.now()}`, { waitUntil: "networkidle" });
  if (!res?.ok()) problems.push(`HTTP ${res?.status()}`);
  // Headless-Chromium meldet Header-Warnungen nicht, Chrome am Desktop schon: deshalb selbst prüfen
  for (const f of (res?.headers()["permissions-policy"] ?? "").split(",")) {
    const name = f.split("=")[0].trim();
    if (name && !KNOWN_FEATURES.has(name)) problems.push(`Permissions-Policy: Chrome kennt '${name}' nicht (Konsolenwarnung)`);
  }
  const text = await page.innerText("body");
  if (!/stockdeck/i.test(text)) problems.push("Seite zeigt keinen stockdeck-Inhalt (weiße Seite?)");
  await browser.close();
  // Doppelte Meldungen (console + Log-Domain) nur einmal zeigen
  return [...new Set(problems)];
}

const checkOnly = process.argv.includes("--check");

if (!checkOnly) {
  if (execSync("git status --porcelain", { encoding: "utf8" }).trim()) fail("Ungespeicherte Änderungen: erst committen, dann deployen.");
  step("Supabase-Werte holen");
  const key = await publishableKey();
  // Kinder (npm, wrangler) brauchen den fetch-Proxy-Schalter nicht, er erzeugt dort nur Warnungen
  const { NODE_USE_ENV_PROXY: _, ...base } = process.env;
  if (!VAPID_PUBLIC_KEY) fail("VITE_VAPID_PUBLIC_KEY fehlt – Web-Push wäre im Build kaputt.");
  if (!CF_ACCOUNT_ID) fail("CLOUDFLARE_ACCOUNT_ID fehlt.");
  const env = {
    ...base,
    VITE_SUPABASE_URL: SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: key,
    VITE_SITE_URL: SITE_URL,
    VITE_VAPID_PUBLIC_KEY: VAPID_PUBLIC_KEY,
  };

  step("Tests und Build");
  execSync("npm test", { stdio: "inherit", env });
  execSync("npm run build", { stdio: "inherit", env });
  bundleCheck(key);

  step("Deploy nach Cloudflare Pages");
  const cfToken = conf("CLOUDFLARE_API_TOKEN") || (await secret("stockdeck-cf-pages-token"));
  const sha = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  const out = execFileSync(
    "npx",
    ["-y", "wrangler@4", "pages", "deploy", "dist", `--project-name=${PAGES_PROJECT}`, "--branch=main", `--commit-hash=${sha}`],
    { encoding: "utf8", env: { ...env, CLOUDFLARE_API_TOKEN: cfToken, CLOUDFLARE_ACCOUNT_ID: CF_ACCOUNT_ID }, shell: process.platform === "win32" }
  );
  const host = new URL(SITE_URL).hostname.replaceAll(".", "\\.");
  const preview = out.match(new RegExp(`https://[a-z0-9]+\\.${host}`))?.[0];
  if (!preview) fail(`Deploy-Ausgabe ohne URL:\n${out}`);
  console.log(`  Deployt: ${preview}`);

  step("Live-Test der Deploy-URL");
  await smokeTest(`${preview}/`);
}

step("Live-Test der Produktions-URL");
await smokeTest(LIVE_URL, checkOnly ? 1 : 6);
console.log("\n✔ Fertig.");
