# Draw Service (port 4005)

The monthly prize draw: draw numbers, match counting, the prize pool, the jackpot rollover, and results. Reached through the gateway at `/api/draws/*`.

## Endpoints

| Method | Gateway path | Who | Purpose |
|---|---|---|---|
| GET | `/api/draws/draws/latest` | Logged in | Last published draw: numbers and pool in rupees |
| GET | `/api/draws/draws/me` | Logged in | The caller's results for published draws, plus the next draw month |
| GET | `/api/draws/admin/draws` | Admin | List draws |
| POST | `/api/draws/admin/draws` | Admin | Create a draft. Body `{ month: "YYYY-MM", mode? }` |
| GET | `/api/draws/admin/draws/:id` | Admin | Draw detail, winners, entrant count |
| POST | `/api/draws/admin/draws/:id/simulate` | Admin | Run the draw and store the outcome. Body `{ mode? }` |
| POST | `/api/draws/admin/draws/:id/publish` | Admin | Publish the simulated draw. Final |
| GET | `/api/draws/admin/reports/draws` | Admin | Totals: pool, paid out, forfeited, jackpot rollover, winners by tier |

## The monthly cycle

1. **Draft:** the scheduler creates the month's draft at 00:05 on the 1st (India time), or an admin creates it.
2. **Simulate:** the draw runs and the full outcome is stored: numbers, every entrant's matches, prizes, and the pool breakdown. Nothing is visible to subscribers yet. Running it again replaces the previous simulation. The mode can be switched here.
3. **Publish:** an admin publishes the simulated draw. Results become visible and cannot be changed. Publishing requires a prior simulation, and the status check is part of the database write, so a double publish is refused.

## Draw modes (PRD 06)

- **Random:** every number from 1 to 45 is equally likely. Numbers come from `crypto.randomInt`, not `Math.random`.
- **Algorithmic:** a number's chance rises with how often it appears in entrants' scores. Every number starts at a weight of 1, so none is ever impossible.

Both modes draw 5 distinct numbers.

## Matching and entry

- An entrant is an active subscriber who holds 5 scores.
- Matches = how many of the drawn numbers appear in the entrant's 5 scores. A repeated score counts once.
- 5 matches = five tier, 4 = four tier, 3 = three tier. Fewer than 3 wins nothing.

## Prize pool (PRD 07)

- Pool = all active subscribers x contribution per subscriber.
- Split: five tier 40%, four tier 35%, three tier 25%.
- Prizes in a tier are split equally between its winners, rounded down to whole paise.
- **Jackpot rollover:** if nobody matches 5, the five-tier money (including any carry-in from last month) rolls over to next month's five tier.
- Unclaimed 4-match and 3-match money is not rolled over (PRD: "No"). It is recorded as forfeited.
- Paise lost to rounding are recorded as forfeited. Nothing is created or lost: `paid + rolled over + forfeited = pool + carry-in`. This is tested with random inputs.

## Assumptions to confirm with the client

| Topic | What the code does | Where to change |
|---|---|---|
| Contribution per subscriber | ₹100 (10000 paise). The PRD does not state the share of each fee | `CONTRIBUTION_PER_SUBSCRIBER_PAISE` |
| Minimum scores to enter | 5 | `MIN_SCORES_TO_ENTER` in `constants.js` |
| Algorithmic weighting | More frequent scores are more likely to be drawn. The PRD does not say which direction is intended | `frequencyWeights()` in `drawEngine.js` |
| Draw numbers | 5 numbers from 1 to 45 | `constants.js` |
| Unclaimed 4 and 3 tiers | Forfeited, not rolled over | `computeOutcome()` |

## Results and winners

- Every entrant gets a row in `drawresults` with their scores, matches, tier, and prize.
- Winners start with `payoutStatus: "pending"`. The winner service (next) will verify proof and move them to `paid`.
- Results are fixed when the draw is simulated. If a subscriber cancels between simulation and publishing, they still appear in that draw. Re-simulate if that matters.

## Subscriber data (for other services)

The draw service calls these internal endpoints, which are blocked from the public gateway:
- Subscription service: `GET /internal/subscribers/active`
- Score service: `POST /internal/scores/batch` (up to 1000 users per request)

Both require the `x-internal-key` header.

## Running the monthly job

Set `ENABLE_DRAW_SCHEDULER=true` on **one** instance only. If two instances run it, both try to create the draft. The second gets a 409 and does nothing, but it is still cleaner to run it once.

## Tests

```bash
npx jest services/draw     # from backend/
```

The engine is tested directly, including a random-input check that money is conserved. The service tests use in-memory models and mocked service clients.
