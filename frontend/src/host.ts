// Where the app runs: standalone (Vite dev / any web server) or inside Dynamics 365 as an HTML web resource.
//
// Dynamics 365 opens a web resource as
//   https://<org>.crm4.dynamics.com/WebResources/fcqa_/cqa/index.html?data=<custom parameters>
// "data" is the "Custom parameter(data)" of the web resource on a form / dashboard / sitemap, URL-encoded, e.g.
//   conversationId=p1-ru-001&role=OPERATOR&embed=1
// When the web resource is on a form with "Pass record object-type code and unique identifier",
// Dynamics also adds ?typename=...&id={GUID}.

declare global {
  interface Window {
    /** Set by the config.js web resource (public/config.js) — the backend address for this installation. */
    CQA_CONFIG?: { apiBase?: string | null };
  }
}

export interface HostContext {
  /** true inside Dynamics 365 (or when ?embed=1 is passed): no sidebar / top bar, only the requested screen */
  embedded: boolean;
  inDynamics: boolean;
  conversationId: string | null;
  role: 'OKK' | 'OPERATOR' | null;
  operatorId: string | null;
  /** Dataverse record the web resource is placed on (if the form passes it) */
  record: { type: string | null; id: string | null };
}

function readParams(): URLSearchParams {
  const url = new URLSearchParams(window.location.search);
  const merged = new URLSearchParams(url);
  const data = url.get('data');
  if (data) {
    // data comes URL-encoded once more: "conversationId%3Dp1-ru-001%26embed%3D1"
    new URLSearchParams(decodeURIComponent(data)).forEach((v, k) => merged.set(k, v));
  }
  return merged;
}

const p = readParams();
const inDynamics = /\/WebResources\//i.test(window.location.pathname) || p.has('orgname') || p.has('typename');

export const host: HostContext = {
  embedded: p.get('embed') === '1' || p.get('embed') === 'true',
  inDynamics,
  conversationId: p.get('conversationId'),
  role: p.get('role') === 'OPERATOR' ? 'OPERATOR' : p.get('role') === 'OKK' ? 'OKK' : null,
  operatorId: p.get('operatorId'),
  record: { type: p.get('typename'), id: p.get('id') },
};

/** Backend base URL: config.js (runtime, per installation) → VITE_API_BASE_URL (build) → /api (dev proxy). */
export const API_BASE = (window.CQA_CONFIG?.apiBase || import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

/** Hash routing inside Dynamics (the web resource URL cannot have extra path segments). */
export const USE_HASH_ROUTER = import.meta.env.VITE_ROUTER === 'hash' || inDynamics;

/** First screen: the conversation card when Dynamics passes a conversationId. */
export function initialPath(): string | null {
  return host.conversationId ? `/conversations/${encodeURIComponent(host.conversationId)}` : null;
}
