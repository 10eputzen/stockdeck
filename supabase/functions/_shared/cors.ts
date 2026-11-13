// Erlaubte Browser-Herkunft: die App (SITE_URL aus den Function-Secrets, inkl. Subdomains für Vorschau-Deploys)
// und lokale Entwicklung.
const SITE_HOST = (() => {
  try {
    return new URL(Deno.env.get("SITE_URL") ?? "").hostname;
  } catch {
    return "";
  }
})();

export function isAllowedOrigin(origin: string): boolean {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (SITE_HOST && url.protocol === "https:" && (url.hostname === SITE_HOST || url.hostname.endsWith(`.${SITE_HOST}`))) {
    return true;
  }
  return (
    url.protocol === "http:" &&
    url.port !== "" &&
    /^(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3})$/.test(url.hostname)
  );
}
