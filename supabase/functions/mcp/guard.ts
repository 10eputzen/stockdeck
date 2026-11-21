// Prüfungen des MCP-Servers ohne Deno-, Netz- oder Datenbankzugriff, damit Vitest sie prüfen kann:
// Herkunft, Protokollversion, Schlüssel aus dem Request, Art des Tokens, Rate-Limit-Antwort.

export const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
export const RATE_LIMIT = 60;
// Supabase-JWTs (Header.Payload.Signatur, base64url) von API-Keys unterscheiden
export const JWT_RE = /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/;

export const originOf = (url: string) => {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
};

/** Browser-Clients dürfen nur von hier kommen; Server-Clients (claude.ai, Claude Code) schicken keinen Origin. */
export function allowedOrigins(siteUrl: string, extra: string): Set<string> {
  return new Set(
    [siteUrl, "https://claude.ai", "https://claude.com", ...extra.split(",")]
      .map((o) => originOf(o.trim()))
      .filter(Boolean),
  );
}

/** Ohne Origin (Server-Client) erlaubt, sonst nur aus der Liste. */
export const originAllowed = (origin: string | null, allowed: Set<string>) => !origin || allowed.has(origin);

/** Header mcp-protocol-version: fehlt = ok (ältere Clients), sonst muss er unterstützt sein. */
export const versionSupported = (header: string | null) => !header || PROTOCOL_VERSIONS.includes(header);

/** Antwort auf initialize: die gewünschte Version, wenn unterstützt, sonst die neueste. */
export const negotiateVersion = (requested: unknown) =>
  PROTOCOL_VERSIONS.includes(String(requested ?? "")) ? String(requested) : PROTOCOL_VERSIONS[0];

export function extractKey(headers: Headers): string | null {
  const auth = headers.get("authorization") ?? "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim() || null;
  const header = headers.get("x-api-key");
  if (header?.trim()) return header.trim();
  // Schlüssel in der URL (…/mcp/<key>) gibt es seit der OAuth-Umstellung nicht mehr
  return null;
}

/** Claims eines JWT ohne Signaturprüfung (die macht danach Supabase Auth). */
export function claims(token: string): Record<string, unknown> | null {
  try {
    const part = token.split(".")[1].replaceAll("-", "+").replaceAll("_", "/");
    return JSON.parse(atob(part.padEnd(part.length + ((4 - (part.length % 4)) % 4), "=")));
  } catch {
    return null;
  }
}

/** Nur Tokens, die der OAuth-Server für einen Client ausgestellt hat: Login-Tokens der App haben kein client_id. */
export const isOAuthClientToken = (token: string) => typeof claims(token)?.client_id === "string";

/** Sekunden bis zur nächsten Minute (das Limit zählt je Kalenderminute). */
export const retryAfter = (now = new Date()) => String(60 - now.getSeconds());
