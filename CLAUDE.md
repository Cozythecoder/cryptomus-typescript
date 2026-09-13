# cryptomus-ts

Zero-dependency, framework-agnostic TypeScript client for the Cryptomus Merchant API.

## Rules

**No comments. Not one, in any file.** No `//`, no `/* */`, no JSDoc, no `#` comments in config or env files. This is absolute and applies to every file in the repo, including tests, examples and build config. Write code that explains itself through naming instead; if something genuinely needs prose, it goes in `README.md`.

**No framework adapters.** This is a standard library, like `stripe-node`. One entry point, no peer dependencies, no NestJS modules or Vue composables shipped in `src/`. Framework wiring belongs in the README as documentation snippets.

**Zero runtime dependencies, but prefer the platform over hand-rolling.** Signing uses Node's built-in `node:crypto` (`src/core/crypto.ts`). An earlier version reimplemented MD5 and base64 by hand for edge-runtime support; that was 110 lines of hand-rolled crypto for a target we do not deploy to, and it was removed. Targets are Node 18+, Bun and Deno — not Vercel Edge or Cloudflare Workers. Reach for a builtin before writing your own, and for a maintained package before adding either.

## Architecture

- `src/core/` — crypto primitives, signing, HTTP transport, errors, the client
- `src/resources/` — one class per API area, each taking the transport
- `src/types/` — request and response types, mirroring the Cryptomus docs
- `examples/mock-cryptomus-server.ts` — local stand-in for the API; Cryptomus ships no sandbox

## Things that will bite you

Cryptomus runs on PHP. Its `json_encode` escapes forward slashes and non-ASCII, `JSON.stringify` does not. Webhook signatures must be verified against the **raw request body**; re-serialising a parsed body with `JSON.stringify` fails every time, because every payload contains URLs. `phpJsonEncode` in `src/core/signature.ts` exists for this and must not be replaced with `JSON.stringify`.

Payments and payouts are signed with **different** API keys. The transport picks the right one per endpoint via the `key` field on each request.

Methods that validate arguments before dispatching must be `async`, so the error arrives as a rejected promise rather than a synchronous throw.

## Verification

`npm run typecheck && npm test && npm run build` must all pass before anything is considered done. The suite includes an end-to-end pass over a real HTTP server whose signature check is written independently of `src/` — keep it that way, so a signing bug cannot be masked by the same bug in the verifier.
