// Links that open astria.ai in a new tab carry attribution so sign-ups and
// purchases can be credited to the Photopea plugin. Normal browser navigation
// (target=_blank) is used; nothing here talks to the API.

export const ASTRIA_WEB_URL = "https://www.astria.ai";

const UTM = { utm_source: "photopea_plugin", utm_medium: "plugin" };

export function astriaWebUrl(path: string, campaign: string): string {
  const hashIndex = path.indexOf("#");
  const hash = hashIndex === -1 ? "" : path.slice(hashIndex);
  const pathAndQuery = hashIndex === -1 ? path : path.slice(0, hashIndex);
  const query = Object.entries({ ...UTM, utm_campaign: campaign })
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&");
  const separator = pathAndQuery.includes("?") ? "&" : "?";
  return `${ASTRIA_WEB_URL}${pathAndQuery}${separator}${query}${hash}`;
}

/** Sign in, then land on the API key page; `aff=photopea` is the affiliate the backend credits. */
export function apiKeyPageUrl(): string {
  return astriaWebUrl("/users/sign_in?redirect_to=/users/edit/api&aff=photopea", "api_key");
}

export function addBalanceUrl(): string {
  return astriaWebUrl("/users/edit#buy-modal", "add_balance");
}

export function openExternal(url: string): void {
  window.open(url, "_blank", "noopener,noreferrer");
}
