// Backend for the official self-hosted Supabase (Docker Compose). The database is reached through
// `docker compose exec db psql`, functions are copied into volumes/functions, and auth and function
// settings go into that folder's .env plus the stockdeck compose override.
import { spawnSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const OVERRIDE = "docker-compose.stockdeck.yml";

export async function connectSelfHosted({ ask, fail, ok, parseEnv, dirArg }) {
  const dir = resolve(dirArg || (await ask("SUPABASE_SELF_HOSTED_DIR", "Folder of your self-hosted Supabase (with docker-compose.yml)")));
  const envFile = join(dir, ".env");
  if (!existsSync(join(dir, "docker-compose.yml")) || !existsSync(envFile))
    fail(`${dir} has no docker-compose.yml and .env; point to the docker folder of the Supabase self-hosting setup.`);
  const sbEnv = parseEnv(readFileSync(envFile, "utf8"));
  const pending = {};

  const compose = (args, input) =>
    spawnSync("docker", ["compose", ...args], { cwd: dir, input, encoding: "utf8", shell: process.platform === "win32" });

  async function sql(query) {
    const q = query.trim().replace(/;\s*$/, "");
    // Single reads come back as JSON rows (like the Management API), everything else runs as a script
    const read = /^select\b/i.test(q) && !q.includes(";");
    const script = read ? `select coalesce(json_agg(t), '[]') from (${q}) t` : query;
    const r = compose(["exec", "-T", "db", "psql", "-U", "postgres", "-d", sbEnv.POSTGRES_DB || "postgres", "-v", "ON_ERROR_STOP=1", "-tAq"], script);
    if (r.status !== 0) fail(`SQL failed: ${(r.stderr || r.stdout || "").trim().slice(0, 400)}`);
    return read ? JSON.parse(r.stdout.trim() || "[]") : [];
  }

  const publicUrl = (sbEnv.SUPABASE_PUBLIC_URL || "").replace(/\/$/, "");
  const authUrl = (sbEnv.API_EXTERNAL_URL || `${publicUrl}/auth/v1`).replace(/\/$/, "");
  return {
    supabaseUrl: publicUrl,
    // The cron job calls the functions from inside the Docker network
    internalUrl: `http://api-gw:${sbEnv.API_GW_HTTP_PORT || "8000"}`,
    callbackUrl: `${authUrl}/callback`,

    async check() {
      if (!publicUrl) fail("SUPABASE_PUBLIC_URL is missing in the Supabase .env.");
      const r = compose(["ps", "--status", "running", "--services"]);
      if (r.status !== 0) fail(`docker compose failed in ${dir}: ${(r.stderr || "").trim().slice(0, 300)}`);
      if (!r.stdout.split(/\s+/).includes("db")) fail("The db service is not running; start the stack with `docker compose up -d` first.");
      ok(`${dir} (${publicUrl})`);
      return sbEnv.SUPABASE_PUBLISHABLE_KEY || sbEnv.ANON_KEY;
    },

    sql,

    async deployFunctions(functions, secrets) {
      const target = join(dir, "volumes", "functions");
      for (const name of ["_shared", ...functions]) {
        rmSync(join(target, name), { recursive: true, force: true });
        cpSync(join("supabase", "functions", name), join(target, name), { recursive: true });
      }
      Object.assign(pending, secrets, { FUNCTIONS_VERIFY_JWT: "false" });
      ok(`copied ${functions.join(", ")} to volumes/functions (each function checks the caller itself)`);
    },

    async configureAuth({ siteUrl, allowList, googleId, googleSecret }) {
      Object.assign(pending, {
        SITE_URL: siteUrl,
        ADDITIONAL_REDIRECT_URLS: allowList.join(","),
        ENABLE_EMAIL_SIGNUP: "false",
        GOOGLE_CLIENT_ID: googleId,
        GOOGLE_SECRET: googleSecret,
      });
      copyFileSync(join("supabase", "self-hosted", OVERRIDE), join(dir, OVERRIDE));
      const files = (sbEnv.COMPOSE_FILE || "docker-compose.yml").split(/[:;]/).filter(Boolean);
      if (!files.includes(OVERRIDE)) files.push(OVERRIDE);
      pending.COMPOSE_FILE = files.join(process.platform === "win32" ? ";" : ":");
      writeEnv(envFile, pending);
      ok(`settings written to ${envFile} (previous version in .env.bak)`);
      const up = compose(["up", "-d"]);
      if (up.status !== 0) fail(`docker compose up failed: ${(up.stderr || "").trim().slice(-400)}`);
      ok("stack restarted with the stockdeck settings");
    },
  };
}

/** Set keys in a dotenv file, keep everything else (comments, order). */
function writeEnv(file, values) {
  const text = readFileSync(file, "utf8");
  copyFileSync(file, `${file}.bak`);
  const left = { ...values };
  const lines = text.split(/\r?\n/).map((line) => {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=/);
    if (!m || !(m[1] in left)) return line;
    const v = left[m[1]];
    delete left[m[1]];
    return `${m[1]}=${v}`;
  });
  const rest = Object.entries(left).map(([k, v]) => `${k}=${v}`);
  if (rest.length) lines.push("", "# stockdeck", ...rest);
  writeFileSync(file, lines.join("\n").replace(/\n*$/, "\n"));
}
