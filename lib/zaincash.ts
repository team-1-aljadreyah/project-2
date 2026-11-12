// ZainCash (payment gateway API v2), the SANDBOX (UAT) only, used by the demo backend (lib/api/mock.ts).
// The real backend does exactly these calls on the server, with its own keys kept secret (docs/backend.md):
//   1. POST /oauth2/token (client credentials) → a bearer token (valid ~24 h).
//   2. POST /api/v2/payment-gateway/transaction/init → { transactionDetails.transactionId, redirectUrl }:
//      the customer pays on ZainCash's own page (his wallet number, then a code), never on our site.
//   3. ZainCash sends him back to our successUrl / failureUrl with ?token=… (a JWT signed with the client
//      secret, HS256): data.currentStatus, transactionId, orderId, amount.
//   4. GET /api/v2/payment-gateway/transaction/inquiry/{id}: the status from ZainCash itself (the truth).
// The keys below are ZainCash's PUBLIC test keys (UAT, from their documentation): no real money moves.

export const ZAINCASH = {
  base: "https://pg-api-uat.zaincash.iq",
  clientId: "758055f4a8044779a35f6ceb69f858b3",
  clientSecret: "bibLCGTxVAig5To3OLLKPJQMlRR7Pefp",
  /** ZainCash takes payments from 1,000 IQD. */
  min: 1000,
};

export type ZcStatus = "SUCCESS" | "FAILED" | "PENDING" | "EXPIRED" | "CANCELLED" | string;

let token: { value: string; until: number } | null = null;

async function auth(): Promise<string> {
  if (token && token.until > Date.now() + 60_000) return token.value;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: ZAINCASH.clientId,
    client_secret: ZAINCASH.clientSecret,
    scope: "payment:read payment:write",
  });
  const r = await fetch(`${ZAINCASH.base}/oauth2/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  if (!r.ok) throw new Error(`ZainCash login ${r.status}`);
  const d = (await r.json()) as { access_token: string; expires_in: number };
  token = { value: d.access_token, until: Date.now() + d.expires_in * 1000 };
  return token.value;
}

/** Open a payment at ZainCash. `orderId` = our payment id; the customer comes back to `back` (success or not). */
export async function zcInit(p: { amount: number; orderId: string; reference: string; back: string; lang: "ar" | "en"; service: string }) {
  const r = await fetch(`${ZAINCASH.base}/api/v2/payment-gateway/transaction/init`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await auth()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      language: p.lang,
      externalReferenceId: p.reference,
      orderId: p.orderId,
      amount: { value: String(p.amount), currency: "IQD" },
      serviceType: p.service,
      redirectUrls: { successUrl: p.back, failureUrl: p.back },
    }),
  });
  if (!r.ok) throw new Error(`ZainCash init ${r.status}`);
  const d = (await r.json()) as { transactionDetails: { transactionId: string }; redirectUrl: string };
  return { transactionId: d.transactionDetails.transactionId, redirectUrl: d.redirectUrl };
}

/** ZainCash's own answer about a payment. */
export async function zcInquiry(transactionId: string) {
  const r = await fetch(`${ZAINCASH.base}/api/v2/payment-gateway/transaction/inquiry/${encodeURIComponent(transactionId)}`, {
    headers: { Authorization: `Bearer ${await auth()}` },
  });
  if (!r.ok) throw new Error(`ZainCash inquiry ${r.status}`);
  const d = (await r.json()) as { status: ZcStatus; customer?: { phone?: string | null } };
  return { status: d.status, phone: d.customer?.phone ?? undefined };
}

const b64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=")), (c) => c.charCodeAt(0));

/** The token ZainCash adds to the way back: its signature checked (HS256, the client secret), then read. */
export async function zcReadReturn(jwt: string): Promise<{ status: ZcStatus; transactionId?: string; orderId?: string } | null> {
  try {
    const [h, p, s] = jwt.split(".");
    if (!h || !p || !s) return null;
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(ZAINCASH.clientSecret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify("HMAC", key, b64url(s), new TextEncoder().encode(`${h}.${p}`));
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(b64url(p))) as { data?: { currentStatus?: ZcStatus; transactionId?: string; orderId?: string } };
    return payload.data?.currentStatus ? { status: payload.data.currentStatus, transactionId: payload.data.transactionId, orderId: payload.data.orderId } : null;
  } catch {
    return null;
  }
}

/** ZainCash's status in ours. Anything not final (PENDING…) stays "created". */
export function zcToOurs(s: ZcStatus): "success" | "failed" | "canceled" | "created" {
  const u = String(s).toUpperCase();
  if (u === "SUCCESS" || u === "COMPLETED") return "success";
  if (u === "FAILED" || u === "FAILURE" || u === "REJECTED" || u === "DECLINED") return "failed";
  if (u === "CANCELLED" || u === "CANCELED" || u === "EXPIRED") return "canceled";
  return "created";
}
