# Score Service (port 4003)

Stores each subscriber's golf scores. Enforces the PRD 05 rules and reads subscription status from the subscription service. Reached through the gateway at `/api/scores/*`.

## Endpoints

| Method | Gateway path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/scores/scores` | Subscriber | The user's scores, newest first (max 5) |
| POST | `/api/scores/scores` | Subscriber | Add a score. Body `{ score, playedOn }` |
| PUT | `/api/scores/scores/:id` | Subscriber | Edit a score. Body `{ score?, playedOn? }` |
| DELETE | `/api/scores/scores/:id` | Subscriber | Delete own score |
| GET | `/api/scores/admin/scores?userId=` | Admin | View a user's scores |
| PATCH | `/api/scores/admin/scores/:id` | Admin | Correct any user's score |

`playedOn` is a calendar date in `YYYY-MM-DD` format. Responses show it the same way.

## Rules (PRD 05)

- Score must be a whole number from 1 to 45 (Stableford).
- Each score needs a date. Only one score is allowed per date. A second entry for the same date returns 409. Edit the existing one instead.
- Only the latest 5 scores are kept, decided by date. Adding a 6th removes the oldest.
- A new score older than all 5 kept scores is refused with 409, because it would be removed straight away.
- Future dates are rejected. Impossible dates such as `2024-02-31` are rejected.
- Non-subscribers get 403. If the subscription service cannot be reached, the request gets 503 (the guard fails closed).
- Deleting a score leaves fewer than 5 stored, and the user can add more.

## How the subscription check works

Each subscriber request calls `GET /internal/access/:userId` on the subscription service, with the `x-internal-key` header. The call has a 3-second timeout.

Input validation runs before this check, so invalid requests never make the network call.

## Database

- One unique index on `{ userId, playedOn }` enforces one score per date, even if the API has a bug.
- Pruning to 5 scores runs after each insert and only touches the current user's scores.
- Scores are stored at UTC midnight, so date comparisons do not depend on time zones.

## Tests

```bash
npx jest services/score     # from backend/
```

The database and subscription check are mocked, so no network or database is needed.

## Time zones (IST)

- The "today" used for the future-date check is the current date in India (IST, UTC+05:30). A user at 1 AM IST on 2 November can enter a score for 2 November, even though it is still 1 November in UTC.
- A score's `playedOn` is the calendar date the user picked. It is stored at UTC midnight of that same date, so it reads back unchanged in any time zone.
- `enteredAt` in responses is when the score was logged, written in IST with the offset, for example `2026-11-02T01:30:00+05:30`.
- Helpers live in `shared/src/timezone.js`: `istDateString`, `toIstIso`, `formatIst`.
