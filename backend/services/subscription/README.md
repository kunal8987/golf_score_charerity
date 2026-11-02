# Subscription Service (port 4002)

Monthly and yearly plans through Stripe Checkout, subscription status, cancellation, and the webhook that keeps our database in sync with Stripe. Reached through the gateway at `/api/subscriptions/*`.

## Endpoints

| Method | Gateway path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/subscriptions/checkout` | Subscriber | Body `{ plan: "monthly" \| "yearly" }`. Returns `{ url }` to redirect the user to Stripe |
| GET | `/api/subscriptions/status` | Any user | Status, plan, renewal date, cancel-at-period-end flag |
| POST | `/api/subscriptions/cancel` | Subscriber | Cancels at the end of the paid period. Access continues until then |
| POST | `/api/subscriptions/resume` | Subscriber | Undoes a pending cancellation |
| POST | `/api/subscriptions/webhook` | Stripe only | Receives Stripe events. Verified by signature, not by login |
| GET | `/api/subscriptions/admin/subscriptions?status=&page=&limit=` | Admin | List subscriptions |
| GET | `/internal/access/:userId` | Service key | Returns `{ hasAccess }`. Blocked at the gateway |

Statuses: `inactive` (never subscribed), `active`, `lapsed` (payment failing), `cancelled`.

## Stripe setup (test mode)

1. In the Stripe dashboard, create a product with two recurring prices: monthly and yearly (the yearly price is the discounted rate from PRD 04).
2. Copy the two price IDs into `.env` as `STRIPE_PRICE_MONTHLY` and `STRIPE_PRICE_YEARLY`.
3. Copy the secret key into `STRIPE_SECRET_KEY`.
4. For local testing, forward webhooks with the Stripe CLI:
   ```bash
   stripe listen --forward-to localhost:4000/api/subscriptions/webhook
   ```
   The CLI prints a `whsec_...` signing secret. Put it in `STRIPE_WEBHOOK_SECRET`.
5. In production, add an endpoint in the Stripe dashboard pointing to `https://<your-gateway>/api/subscriptions/webhook`. Subscribe it to: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`.

## How the sync works

- Stripe is the source of truth. The local `subscriptions` record is a copy.
- On each subscription event, the service re-reads the subscription from Stripe rather than trusting the event payload. This prevents an old event from overwriting a newer state.
- Handlers are idempotent, so a repeated webhook delivery gives the same result.
- If processing fails, the webhook returns 500 and Stripe retries.
- Card details are entered on Stripe's hosted page, so they never reach our servers.

## Known limits (for later)

- A lapsed user who subscribes again gets a new Stripe subscription. The old one may still exist in Stripe until it is cancelled. Cancelling old subscriptions is planned for the polish phase.
- The raw webhook body is required, so the webhook route is mounted before `express.json()` in `src/app.js`. Do not move it.

## Tests

```bash
npx jest services/subscription     # from backend/
```

Stripe and the database are mocked, so no keys or network access are needed.
