# cryptomus-ts

A fully typed, dependency-free [Cryptomus Merchant API](https://doc.cryptomus.com/merchant-api) client for TypeScript. One client, no framework coupling — use it from Express, NestJS, Next.js, Fastify, Hono, Bun, Deno or a plain script.

- **Complete API coverage** — every documented merchant endpoint: payments, static wallets, payouts, transfers, recurring payments, balances, exchange rates, discounts and the webhook test endpoints.
- **Zero dependencies** — no axios, no crypto library. Signing uses Node's built-in `node:crypto`. Runs on Node 18+, Bun and Deno.
- **Webhook verification that actually works** — see [the signature gotcha](#the-signature-gotcha-read-this) below.
- **Typed errors, retries, timeouts** and cursor pagination as an async iterator.

```bash
npm install git+ssh://git@github.com/Cozythecoder/cryptomus-typescript.git
```

---

## Quick start

```ts
import { CryptomusClient } from 'cryptomus-ts';

const cryptomus = new CryptomusClient({
  merchantId: process.env.CRYPTOMUS_MERCHANT_ID!,
  paymentKey: process.env.CRYPTOMUS_PAYMENT_KEY!,
  payoutKey: process.env.CRYPTOMUS_PAYOUT_KEY, // only needed for payouts
});

const invoice = await cryptomus.payments.create({
  amount: '19.99',
  currency: 'USD',
  order_id: 'order-1024',
  url_callback: 'https://example.com/api/cryptomus/webhook',
  url_success: 'https://example.com/checkout/thanks',
});

// Send your customer here.
console.log(invoice.url);
```

Or build from the environment (`CRYPTOMUS_MERCHANT_ID`, `CRYPTOMUS_PAYMENT_KEY`, `CRYPTOMUS_PAYOUT_KEY`):

```ts
const cryptomus = CryptomusClient.fromEnv();
```

> **Keys are secrets.** Construct the client on a server only. A leaked payout key lets anyone drain your balance.

---

## The signature gotcha (read this)

Cryptomus signs requests as `md5(base64(body) + apiKey)`. The catch is on the **receiving** end.

Cryptomus runs on PHP, and PHP's `json_encode()` escapes forward slashes and all non-ASCII, while `JSON.stringify` does neither:

```js
// PHP    json_encode(['url' => 'https://a.test/x', 'n' => 'é'])
{"url":"https:\/\/a.test\/x","n":"é"}

// JS     JSON.stringify({ url: 'https://a.test/x', n: 'é' })
{"url":"https://a.test/x","n":"é"}
```

So the classic integration bug is:

```ts
// ✗ Fails for every real webhook — they all contain URLs.
const expected = md5(base64(JSON.stringify(req.body)) + key);
```

Every Cryptomus webhook body contains at least one URL, so re-serialising a parsed body with `JSON.stringify` produces a different string and the signature never matches.

This library handles it two ways:

```ts
// ✓ Best: verify the raw, unparsed body — byte-exact, no assumptions.
const event = cryptomus.webhooks.constructEvent(rawBody);

// ✓ Fallback: your framework already parsed it. Re-encodes the way PHP would.
if (cryptomus.webhooks.verifyParsed(req.body)) { /* ... */ }
```

`constructEvent` throws `CryptomusSignatureError` on a mismatch, so anything it returns is safe to act on.

Also worth locking down: Cryptomus delivers webhooks from **`91.227.144.54`** only. `cryptomus.webhooks.isTrustedIp(ip)` checks it (and handles the `::ffff:` form Node reports behind proxies).

---

## Which key signs what

Cryptomus issues two API keys and they are not interchangeable.

| Category | Key | Methods |
|---|---|---|
| Payments, static wallets, recurring, balance, discounts, webhook tests | **payment** | `payments.*`, `wallets.*`, `recurring.*`, `misc.balance()`, `webhooks.test*` |
| Payouts and wallet transfers | **payout** | `payouts.*` |
| Exchange rates | none — public | `misc.exchangeRates()` |

The client picks the right one per endpoint. Call a payout method without a `payoutKey` and you get a clear error before any request is sent, rather than an opaque `Wrong api key` from the server.

> Generating a new payout key blocks withdrawals for 24 hours, so keep it stable.

---

## API reference

### Payments

```ts
await cryptomus.payments.create({ amount, currency, order_id, /* ... */ }); // POST /v1/payment
await cryptomus.payments.info({ order_id: 'order-1024' });                  // POST /v1/payment/info
await cryptomus.payments.list({ date_from, date_to }, { cursor });          // POST /v1/payment/list
await cryptomus.payments.services();                                        // POST /v1/payment/services
await cryptomus.payments.refund({ uuid, address, is_subtract: true });      // POST /v1/payment/refund
await cryptomus.payments.resendWebhook({ order_id });                       // POST /v2/payment/resend
await cryptomus.payments.qrCode({ merchant_payment_uuid });                 // POST /v1/payment/qr
await cryptomus.payments.markAsPaid({ order_id });                          // POST /v1/payment/mark-as-paid
await cryptomus.payments.discounts();                                       // POST /v1/payment/discount/list
await cryptomus.payments.setDiscount({ currency, network, discount_percent }); // POST /v1/payment/discount/set
```

Reusing an `order_id` on `create` returns the existing invoice rather than opening a second one, which makes the call safe to retry.

**Iterate history without touching cursors:**

```ts
for await (const payment of cryptomus.payments.listAll({ date_from: '2026-01-01 00:00:00' })) {
  console.log(payment.order_id, payment.payment_status);
}
```

**Poll to a final status** (for scripts and tests — use webhooks in production):

```ts
const final = await cryptomus.payments.waitForFinalStatus(
  { order_id: 'order-1024' },
  { intervalMs: 5_000, timeoutMs: 900_000, onPoll: (p) => console.log(p.payment_status) },
);
```

### Static wallets

A permanent deposit address per customer, instead of a fresh invoice per purchase.

```ts
await cryptomus.wallets.create({ currency: 'USDT', network: 'tron', order_id: 'user-42' }); // POST /v1/wallet
await cryptomus.wallets.block({ order_id: 'user-42', is_force_refund: false });             // POST /v1/wallet/block-address
await cryptomus.wallets.refundBlocked({ order_id: 'user-42', address });                    // POST /v1/wallet/blocked-address-refund
await cryptomus.wallets.qrCode({ wallet_address_uuid });                                    // POST /v1/wallet/qr
```

### Payouts

```ts
await cryptomus.payouts.create({ amount, currency, order_id, address, is_subtract: true }); // POST /v1/payout
await cryptomus.payouts.info({ order_id: 'payout-77' });                                    // POST /v1/payout/info
await cryptomus.payouts.list({ date_from, date_to }, { cursor });                           // POST /v1/payout/list
await cryptomus.payouts.services();                                                         // POST /v1/payout/services
await cryptomus.payouts.transferToPersonal({ amount: '50', currency: 'USDT' });             // POST /v1/transfer/to-personal
await cryptomus.payouts.transferToBusiness({ amount: '50', currency: 'USDT' });             // POST /v1/transfer/to-business
```

`order_id` is your idempotency key — Cryptomus rejects a duplicate rather than paying twice. Derive it deterministically from the withdrawal it represents.

### Recurring payments

```ts
await cryptomus.recurring.create({ amount: '9.99', currency: 'USD', name: 'Pro plan', period: 'monthly' }); // POST /v1/recurrence/create
await cryptomus.recurring.info({ uuid });                                                                   // POST /v1/recurrence/info
await cryptomus.recurring.list({ cursor });                                                                 // POST /v1/recurrence/list
await cryptomus.recurring.cancel({ uuid });                                                                 // POST /v1/recurrence/cancel
```

A new subscription starts in `wait_accept` — send the customer to its `url` to approve it before expecting charges.

### Balances and rates

```ts
const { merchant, user } = await cryptomus.misc.balance(); // POST /v1/balance, array unwrapped for you
const rates = await cryptomus.misc.exchangeRates('ETH');   // GET /v1/exchange-rate/ETH/list (public)
```

### Webhook testing

```ts
await cryptomus.webhooks.testPayment({
  url_callback: 'https://example.com/api/cryptomus/webhook',
  currency: 'USDT',
  network: 'tron',
  status: 'paid',
});

await cryptomus.webhooks.testWallet({ /* same shape */ });
```

---

---

## Framework integration

There is no framework adapter to install — the client is plain TypeScript and works anywhere. The only thing that differs per framework is **getting the raw request body for webhook verification**, so here is that one detail for each.

The rule everywhere: read the body as a **string, before any JSON parser touches it**.

### Express

```ts
import express from 'express';
import { CryptomusClient, CryptomusSignatureError } from 'cryptomus-ts';

const app = express();
const cryptomus = CryptomusClient.fromEnv();

// express.raw, NOT express.json — mount it on this route only.
app.post('/api/cryptomus/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  try {
    const event = cryptomus.webhooks.constructEvent(req.body.toString('utf8'));

    if (event.type === 'payment' && event.is_final && event.status === 'paid') {
      void fulfilOrder(event.order_id);
    }

    res.json({ ok: true });
  } catch (error) {
    if (error instanceof CryptomusSignatureError) return res.sendStatus(401);
    throw error;
  }
});
```

If `express.json()` is mounted globally, register it *after* this route, or exclude this path.

### NestJS

Create the app with `rawBody: true`, then read `req.rawBody`:

```ts
// main.ts
const app = await NestFactory.create(AppModule, { rawBody: true });
```

```ts
// cryptomus.controller.ts
import { Controller, Post, Req, HttpCode, UnauthorizedException } from '@nestjs/common';
import { CryptomusClient, CryptomusSignatureError, type CryptomusWebhookPayload } from 'cryptomus-ts';

@Controller('cryptomus')
export class CryptomusController {
  private readonly cryptomus = CryptomusClient.fromEnv();

  @Post('webhook')
  @HttpCode(200)
  async handle(@Req() req: { rawBody?: Buffer }) {
    let event: CryptomusWebhookPayload;

    try {
      event = this.cryptomus.webhooks.constructEvent(req.rawBody!.toString('utf8'));
    } catch (error) {
      if (error instanceof CryptomusSignatureError) throw new UnauthorizedException();
      throw error;
    }

    if (event.type === 'payment' && event.is_final && event.status === 'paid') {
      await this.orders.markPaid(event.order_id);
    }

    return { ok: true };
  }
}
```

Register the client as a provider if you prefer DI — it is a plain class, so `{ provide: CryptomusClient, useFactory: () => CryptomusClient.fromEnv() }` is all it takes.

### Next.js — App Router

```ts
// app/api/cryptomus/webhook/route.ts
import { CryptomusClient, CryptomusSignatureError } from 'cryptomus-ts';

export const runtime = 'nodejs';

const cryptomus = CryptomusClient.fromEnv();

export async function POST(request: Request) {
  // request.text(), NOT request.json() — the signed bytes must survive.
  const rawBody = await request.text();

  try {
    const event = cryptomus.webhooks.constructEvent(rawBody);

    if (event.type === 'payment' && event.is_final && event.status === 'paid') {
      await fulfilOrder(event.order_id);
    }
  } catch (error) {
    if (error instanceof CryptomusSignatureError) {
      return Response.json({ error: 'Invalid signature' }, { status: 401 });
    }
    // Any other failure returns 500, which tells Cryptomus to retry.
    throw error;
  }

  return Response.json({ ok: true });
}
```

Creating an invoice from a route handler or server action:

```ts
// app/api/checkout/route.ts
export async function POST(request: Request) {
  const { amount, orderId } = await request.json();

  const invoice = await cryptomus.payments.create({
    amount,
    currency: 'USD',
    order_id: orderId,
    url_callback: 'https://example.com/api/cryptomus/webhook',
  });

  return Response.json({ url: invoice.url });
}
```

### Next.js — Pages Router

Disable the body parser and read the stream yourself:

```ts
// pages/api/cryptomus/webhook.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { CryptomusClient, CryptomusSignatureError } from 'cryptomus-ts';

export const config = { api: { bodyParser: false } }; // required

const cryptomus = CryptomusClient.fromEnv();

async function readRawBody(req: NextApiRequest): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const event = cryptomus.webhooks.constructEvent(await readRawBody(req));
    // ...
    res.status(200).json({ ok: true });
  } catch (error) {
    if (error instanceof CryptomusSignatureError) return res.status(401).end();
    throw error;
  }
}
```

### Fastify

```ts
fastify.addContentTypeParser(
  'application/json',
  { parseAs: 'string' },
  (_req, body, done) => done(null, body), // keep the raw string
);

fastify.post('/api/cryptomus/webhook', async (request, reply) => {
  const event = cryptomus.webhooks.constructEvent(request.body as string);
  // ...
  return { ok: true };
});
```

### Hono, Elysia, Bun, Deno

All use the standard `Request`, so it is the same one line:

```ts
const event = cryptomus.webhooks.constructEvent(await request.text());
```

When a service only needs to verify webhooks and never calls the API, skip the client:

```ts
import { createWebhookVerifier } from 'cryptomus-ts';

const verifier = createWebhookVerifier({ paymentKey: env.CRYPTOMUS_PAYMENT_KEY });
const event = verifier.constructEvent(await request.text());
```

### When you cannot get the raw body

Some stacks parse the body before you can intervene. `verifyParsed` re-encodes the object the way PHP would:

```ts
if (!cryptomus.webhooks.verifyParsed(req.body)) return res.sendStatus(401);
```

It works for every payload Cryptomus currently sends, but it relies on key order surviving `JSON.parse`. Prefer the raw body whenever you can get it.

### Browser and mobile clients

Never put an API key in client code — a leaked payout key lets anyone drain your balance. Your frontend should talk to your backend, and your backend to Cryptomus:

```
browser  →  your backend (cryptomus-ts)  →  Cryptomus
```

To show live payment status in a UI, expose a small status endpoint that calls `payments.info()` server-side, and poll it from the client. Fulfil orders from the verified webhook, never from a client-side poll.

---

## Installing this package

The repo is private, so there are three ways to consume it. Nothing needs publishing to the public npm registry.

### From the private repo (simplest)

```bash
npm install git+ssh://git@github.com/Cozythecoder/cryptomus-typescript.git
```

Anyone with repo access and an SSH key can install it. The `prepare` script builds `dist/` automatically on install, so consumers never need to build it themselves. Pin a version with a tag or commit:

```bash
npm install git+ssh://git@github.com/Cozythecoder/cryptomus-typescript.git#v1.0.0
```

### From a tarball

The npm equivalent of a Python wheel:

```bash
npm pack                                   # produces cryptomus-ts-1.0.0.tgz
npm install ../path/to/cryptomus-ts-1.0.0.tgz
```

Useful for air-gapped installs or vendoring the artefact into another repo.

### From GitHub Packages

For a private registry with proper versioning, publish to GitHub Packages:

```bash
npm version patch
npm publish
```

Consumers add an `.npmrc`:

```
@cozythecoder:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

This needs the package renamed to the `@cozythecoder/` scope in `package.json`.

### Local development against another project

```bash
cd cryptomus-typescript && npm link
cd ../your-app && npm link cryptomus-ts
```

Changes appear immediately, but remember `npm link` uses your working tree, so run `npm run build` after editing.

---

## Environment variables

Copy `.env.example` to `.env`. Never commit `.env`, and never expose these to a browser bundle — no `NEXT_PUBLIC_` or `VITE_` prefix, since that inlines the value into client code and a leaked payout key lets anyone drain your balance.

| Variable | Required | Where to find it | Signs |
|---|---|---|---|
| `CRYPTOMUS_MERCHANT_ID` | Always | Dashboard → Business → project → Settings | Sent as the `merchant` header |
| `CRYPTOMUS_PAYMENT_KEY` | For almost everything | Same page → API keys | Payments, static wallets, recurring, balance, discounts, webhook tests, and webhook verification |
| `CRYPTOMUS_PAYOUT_KEY` | Only to send funds | Personal account settings, 2FA required first | Payouts and wallet transfers |

The payment key needs domain confirmation and merchant moderation before it activates. Generating a new **payout** key blocks withdrawals for 24 hours, so do not rotate it casually.

`PORT`, `SEND_PAYOUT` and `PAYOUT_ADDRESS` are read only by files in `examples/`. `SEND_PAYOUT` defaults to `0` so the payout example cannot move real funds by accident.

For NestJS, load these with `@nestjs/config` and read them via `ConfigService.getOrThrow` so a missing key fails at boot rather than on the first customer payment.

---

## Testing without Cryptomus credentials

**Cryptomus has no sandbox and no testnet.** Its own `test-webhook` endpoints still require a real, moderated API key, and keys are only issued after domain confirmation and merchant moderation — with no published timeline. So you would normally be blocked from writing any code until approval lands.

This repo ships a local stand-in so you are not:

```bash
npm run mock
```

```ts
const cryptomus = new CryptomusClient({
  merchantId: '8b03432e-385b-4670-8d06-064591096795',
  paymentKey: 'mock-payment-key',
  payoutKey: 'mock-payout-key',
  baseUrl: 'http://127.0.0.1:4242',   // the only line you change for production
});
```

It is a test double with teeth:

- **Verifies your signatures with its own independent implementation**, so a signing bug fails locally with a diff of expected vs. received, instead of as a `Wrong api key` in production.
- **Delivers real signed webhooks** to your `url_callback` — the part most integrations get wrong — so `constructEvent` is genuinely exercised.
- **Enforces the payment/payout key split**, rejecting a payout signed with the payment key exactly as the real API does.
- **Runs the lifecycle**, moving invoices `check → confirm_check → paid` so you see non-final states rather than only the happy ending.

Drive any invoice by hand:

```bash
curl -X POST localhost:4242/_control/advance \
  -H 'content-type: application/json' \
  -d '{"order_id":"order-1","status":"wrong_amount"}'
```

Any status works — `paid`, `paid_over`, `wrong_amount`, `cancel`, `locked` — which is the only practical way to test your AML-lock and underpayment branches, since you cannot produce those on demand against the real API either. `AUTO_PAY=0` disables auto-settlement so nothing moves unless you say so.

When your keys arrive, drop `baseUrl` and everything else stays put.

---

## Errors

Every failure is a `CryptomusError` subclass:

| Class | When |
|---|---|
| `CryptomusValidationError` | HTTP 422 — bad parameters. `.errors` holds per-field messages. |
| `CryptomusAuthenticationError` | HTTP 401/403 — wrong merchant ID or key. |
| `CryptomusRateLimitError` | HTTP 429. `.retryAfter` in seconds when the server sends it. |
| `CryptomusApiError` | Any other API failure, including HTTP 200 with `state: 1`. |
| `CryptomusTimeoutError` | Request exceeded the timeout. |
| `CryptomusNetworkError` | DNS, TLS, socket or caller abort. |
| `CryptomusSignatureError` | A webhook failed verification. |

```ts
import { CryptomusValidationError, CryptomusError } from 'cryptomus-ts';

try {
  await cryptomus.payments.create({ amount: '', currency: 'USD', order_id: 'x' });
} catch (error) {
  if (error instanceof CryptomusValidationError) {
    console.error(error.validationMessages); // ['amount: The amount field is required.']
  } else if (error instanceof CryptomusError) {
    console.error(error.status, error.endpoint, error.message);
  }
}
```

A `state: 1` body returned with HTTP 200 is treated as a failure, not a success — Cryptomus does this for cases like "Payment not found".

---

## Configuration

```ts
new CryptomusClient({
  merchantId: '...',
  paymentKey: '...',
  payoutKey: '...',
  baseUrl: 'https://api.cryptomus.com', // default
  timeoutMs: 30_000,                    // default
  maxRetries: 2,                        // default
  retryDelayMs: 300,                    // base backoff, doubled per attempt with jitter
  defaultHeaders: { 'x-trace-id': '…' },
  fetch: myInstrumentedFetch,           // swap in a mock or an instrumented fetch
  onRequest: ({ endpoint, status, attempt, durationMs }) => metrics.record(endpoint, durationMs),
});
```

Retries cover transport failures and `408/425/429/500/502/503/504`, honouring `Retry-After`. A `422` is never retried — the request will not become valid. Per-call overrides:

```ts
await cryptomus.payments.info({ order_id }, { timeoutMs: 5_000, maxRetries: 0, signal });
```

---

## Payment statuses

```ts
import { isFinalPaymentStatus, isPaidPaymentStatus, FINAL_PAYMENT_STATUSES } from 'cryptomus-ts';
```

| Status | Meaning | Final |
|---|---|:--:|
| `check` | Awaiting the transaction on-chain | |
| `process` | Being processed | |
| `confirm_check` | Seen on-chain, awaiting confirmations | |
| `wrong_amount_waiting` | Underpaid, top-up still possible | |
| `refund_process` | Refund in progress | |
| `wrong_amount` | Client paid less than required | |
| `paid` | Paid exactly | ✓ |
| `paid_over` | Paid more than required | ✓ |
| `fail` | Payment error | ✓ |
| `cancel` | Client never paid | ✓ |
| `system_fail` | System error | ✓ |
| `refund_fail` | Refund failed | ✓ |
| `refund_paid` | Refund completed | ✓ |
| `locked` | Funds locked by AML | ✓ |

Treat `paid` **and** `paid_over` as success. Payout statuses (`process`, `check`, `paid`, `fail`, `cancel`, `system_fail`) have `isFinalPayoutStatus`.

---

## Runtime support

Signing uses Node's built-in `node:crypto`, so the package works on Node 18+, Bun and Deno with no dependencies.

It does **not** run on Vercel Edge or Cloudflare Workers. Cryptomus signs with MD5, and Web Crypto deliberately omits MD5 while edge runtimes omit `node:crypto`. Supporting them needs a bundled MD5, which is not worth ~110 lines of hand-rolled crypto for a gateway you call from a server anyway. Run your webhook route on the Node runtime — in Next.js that is `export const runtime = 'nodejs'`.

If you only need to verify webhooks, skip the client entirely:

```ts
import { createWebhookVerifier } from 'cryptomus-ts';

const verifier = createWebhookVerifier({ paymentKey: process.env.CRYPTOMUS_PAYMENT_KEY! });
const event = verifier.constructEvent(rawBody);
```

---

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
```

The suite covers MD5 against the RFC 1321 vectors and cross-checks it against `node:crypto` on random input, PHP-encoding vectors, webhook verification including tampering and forgery, every endpoint path and its signing key, retry and timeout behaviour, and an end-to-end pass over a real HTTP server whose signature check is written independently of `src/`.

## Licence

MIT
