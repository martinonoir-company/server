# Payment system — required environment variables

The payment system is **server-mediated**: only the server holds provider
credentials and talks to Paystack / Moniepoint. No payment keys belong in
any frontend (`NEXT_PUBLIC_*`) — clients only ever call this server.

Set these on the **server** (e.g. EC2 / Railway env, or `server/.env`).
This file documents names and purpose only — **never commit real values.**

## Paystack — storefront (web) + mobile app

| Variable | Purpose |
|---|---|
| `PAYSTACK_SECRET_KEY` | Paystack secret key. Used to initialize transactions, verify them, and validate the webhook signature (HMAC-SHA512). When unset, the Paystack provider runs in **stub mode** — no real charges. |

The Paystack webhook must be registered in the Paystack dashboard, pointing at:

```
POST https://<api-host>/api/v1/payments/webhooks/paystack
```

The webhook is only a "go reconcile" nudge — the server confirms every
payment with its own `verify` call, so a missed webhook is non-fatal
(the client also triggers a reconcile on return from checkout).

## Moniepoint — POS card terminal

| Variable | Purpose |
|---|---|
| `MONIEPOINT_API_KEY` | Moniepoint POS API bearer key (scopes `transaction:push`, `transaction:read`). Used to push card transactions to a physical terminal and look up their status. When unset, the Moniepoint provider runs in **stub mode**. |
| `MONIEPOINT_BASE_URL` | Optional. Moniepoint POS API base URL. Defaults to `https://api.pos.moniepoint.com`. |

The Moniepoint webhook (optional accelerator) can point at:

```
POST https://<api-host>/api/v1/payments/webhooks/moniepoint
```

Moniepoint publishes no webhook payload schema, so the webhook is treated
purely as a nudge: the server stores the raw body and confirms the
transaction via the authoritative lookup API. Polling is the source of
truth — the webhook only speeds it up.

**Per-terminal serial:** the physical Moniepoint device serial is **not**
an env var — it is configured per POS terminal in the admin
(Branches → terminal → "Moniepoint Terminal Serial").

## Shared

| Variable | Purpose |
|---|---|
| `FRONTEND_URL` | Storefront base URL. Used to build the Paystack `callback_url` (`<FRONTEND_URL>/order-confirmation?order=...`) when a caller does not supply one. |

## Notes

- With no provider keys set, the whole flow still runs in stub mode end to
  end — useful for development. No real money moves.
- Order/payment amounts are stored in **minor units** (kobo / cents)
  everywhere — DB, server, and all clients.
