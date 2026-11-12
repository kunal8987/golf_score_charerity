# Charity Service (port 4004)

Charity directory, profiles, events, homepage spotlight, and one-time donations through Stripe. Reached through the gateway at `/api/charities/*`.

## Public endpoints

| Method | Gateway path | Purpose |
|---|---|---|
| GET | `/api/charities?q=&category=&page=&limit=` | Directory. Search name and description, filter by category. Featured first |
| GET | `/api/charities/spotlight` | Up to 3 featured charities for the homepage |
| GET | `/api/charities/:id` | Profile with images and **upcoming** events only |

Categories: `health`, `education`, `children`, `environment`, `animals`, `community`, `other`.

## Donations (logged-in users)

| Method | Gateway path | Purpose |
|---|---|---|
| POST | `/api/charities/donations` | Body `{ charityId, amountInr }`. Returns a Stripe Checkout `url` |
| GET | `/api/charities/donations/me` | The caller's donation history |
| POST | `/api/charities/webhook` | Stripe only. Verified by signature |

Donations are one-time and separate from the subscription (PRD 08.2). They do not give draw entries.

Amount limits: ₹100 to ₹1,00,000, whole rupees. Stored in paise.

## Admin endpoints (PRD 11, control surfaces 03 and 05)

| Method | Gateway path | Purpose |
|---|---|---|
| GET | `/api/charities/admin/charities` | All charities, including inactive ones |
| POST | `/api/charities/admin/charities` | Create. The slug is generated from the name (`golf-4-kids-trust`) |
| PATCH | `/api/charities/admin/charities/:id` | Edit fields, feature or reactivate |
| DELETE | `/api/charities/admin/charities/:id` | Soft delete: hidden from the public site, past donations stay linked |
| POST | `/api/charities/admin/charities/:id/events` | Add an event. Must be in the future |
| DELETE | `/api/charities/admin/charities/:id/events/:eventId` | Remove an event |
| GET | `/api/charities/admin/reports/donations` | Completed donations per charity, and the total |

## Charity contribution maths

`contributionAmount(feePaise, percentage)` in `src/services/contribution.js`:
- Minimum 10%, maximum 100% (PRD 08.1).
- Integer maths in paise. The result is rounded down, so the charity never gets more than the agreed share.

The subscription service and the draw service will use this when they bill and calculate prize pools.

## Setting up donation payments

1. In Stripe, create a second webhook endpoint pointing to `https://<your-gateway>/api/charities/webhook`.
2. Subscribe it to: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`.
3. Put its signing secret in `STRIPE_DONATION_WEBHOOK_SECRET`. This is different from the subscription webhook secret.
4. For local testing: `stripe listen --forward-to localhost:4000/api/charities/webhook`. The secret it prints is for this listener only.

Donations move from `pending` to `completed` only when Stripe confirms payment. Repeated webhook deliveries change nothing.

## Known limits (for later)

- **Charity selection lives in the auth service.** The user's chosen charity and percentage are stored on their account. Auth does not yet check that the charity exists. An internal lookup from auth to this service would close that gap.
- **Subscription contributions are not in the reports yet.** The admin report covers one-time donations only. Monthly contribution totals need billing events from the subscription service.
- **Media is stored as URLs.** Admins paste https image links. Direct uploads through Cloudinary can be added later.

## Tests

```bash
npx jest services/charity     # from backend/
```

The database and Stripe are mocked.
