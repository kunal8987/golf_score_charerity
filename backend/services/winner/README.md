# Winner Service (port 4006)

Verifies prize winners and tracks payouts. Subscribers upload a screenshot of their golf scores, an admin checks it, and once it is approved the prize can be marked paid. Reached through the gateway at `/api/winners/*`.

## Endpoints

| Method | Gateway path | Who | Purpose |
|---|---|---|---|
| GET | `/api/winners/winners/me` | Logged in | The user's winnings, status, and totals |
| POST | `/api/winners/winners/:id/proof` | Winner | Upload a screenshot. Multipart field `proof` |
| GET | `/api/winners/admin/winners?verificationStatus=&payoutStatus=` | Admin | Full winners list, filterable |
| GET | `/api/winners/admin/winners/:id` | Admin | Winner detail with a signed link to the proof |
| PATCH | `/api/winners/admin/winners/:id/review` | Admin | Body `{ decision: "approve" \| "reject", reason? }` |
| PATCH | `/api/winners/admin/winners/:id/payout` | Admin | Mark the prize paid. Only after approval |

## Lifecycle (PRD 09)

```
awaiting_proof --upload--> pending_review --approve--> approved --pay--> paid
                                |                         
                             reject --> rejected --upload--> pending_review
```

- A payout can only be marked paid once the proof is approved. Payment is claimed once, so a second attempt is refused.
- A rejected screenshot can be replaced. The rejection reason is shown to the user.
- An approved prize cannot be changed or re-uploaded.

## Proof rules

- JPEG or PNG only. The file's content is checked, so a text file renamed `.jpg` is refused.
- 5 MB at most, one file per upload.
- Held in memory and sent straight to Cloudinary. Nothing is written to local disk.
- Stored as an **authenticated** asset. Nobody can open it without a signed link, and admins get a link that expires after 5 minutes. Screenshots can show personal details, so they are kept private.

## How winners reach this service

- The winner service copies new winners from the draw service (`GET /internal/winners`). This runs when a list or the user's winnings is loaded, at most once per `WINNER_SYNC_TTL_MS`.
- Each winner is stored once, keyed by the draw result id, so repeated syncs never duplicate.
- If the draw service is down, stored data is still shown and the response includes `synced: false`.

## Payout mirroring

When a prize is marked paid, the winner service updates the draw service (`PATCH /internal/results/:id/payout`) so the subscriber's draw history matches.

1. The payment is claimed in this service first, so it happens once.
2. The draw service is then updated.
3. If that update fails, the claim is undone and the admin gets a 503. Nothing is left half-done.

## Assumptions to confirm with the client

| Topic | What the code does |
|---|---|
| Actual money transfer | Happens outside the system. An admin marks the prize paid after paying |
| Proof deadline | None. The PRD does not give one |
| Number of rejections | No limit. A winner can keep re-uploading |
| Who can win | Anyone in a published draw. Their subscription status is not checked at payout |

## Known limits

- **Cloudinary has not been tested against a live account.** The code follows the Cloudinary v2 API, but please upload one test screenshot and open its signed link once before launch.
- **Orphaned files.** If storing the file succeeds but saving the record then fails, the file stays in Cloudinary. A cleanup job can be added later.
- **Payout mirror is not transactional across services.** The steps above keep both sides consistent in normal failures. A crash at the exact wrong moment could still leave them out of step. An admin can check the record and fix it.

## Tests

```bash
npx jest services/winner     # from backend/
```

Cloudinary and the draw service are mocked. The file-type checks and the review and payout rules are tested directly.
