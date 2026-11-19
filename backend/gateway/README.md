# API Gateway (port 4000)

The only service the Next.js client talks to. It checks who is calling, applies the access rules, and forwards the request to the right service. Everything under `/api/...` goes through it.

```
client --> gateway (4000) --> auth | subscriptions | scores | charities | draws | winners
```

## What the gateway does for every request

1. **Cleans the request.** Removes headers a client must never set (`x-user-id`, `x-user-role`, `x-internal-key`). Gives the request an ID (`X-Request-Id`), keeping a valid one the client sent.
2. **Blocks internal paths.** Anything containing `/internal/` returns 404, whoever asks.
3. **Checks who is calling** against the access rules (see below).
4. **Refuses large bodies.** 1 MB by default, 6 MB for the proof upload.
5. **Forwards** the request with the verified identity set in `x-user-id` and `x-user-role`.
6. **Returns errors in one format.** 502 if a service is down, 504 if it is too slow.

Rate limiting runs for all requests, per client IP. Stripe webhooks are exempt, because they are signed and arrive in bursts.

## Access rules

| Level | Who may call | Example |
|---|---|---|
| `public` | Anyone | Charity directory, charity profile, signup, login, Stripe webhooks |
| `auth` | Any logged-in user | Profile, draw results, donations, winnings |
| `subscriber` | Logged in, with an active subscription | Score entry |
| `admin` | Logged in, role `admin` | Everything under `/admin/` and `/users` |

Any route not listed is protected (`auth`). A new route stays closed until someone opens it on purpose. The full table is in `src/accessRules.js`, and it is tested.

## Subscription checks

For subscriber routes, the gateway asks the subscription service whether the user is active, and remembers the answer for `SUBSCRIPTION_CACHE_TTL_MS` (default 60 seconds). If the subscription service cannot be reached, the request is refused (503). The gateway never guesses.

The score service also checks on every score entry, without a cache. So a cancelled subscriber can still see cached access at the gateway for up to a minute, but cannot enter a score.

## Ops status

`GET /ops/services` with the `x-internal-key` header returns whether each service is up and how quickly it answered. It is not public.

## Settings

| Variable | Default | Meaning |
|---|---|---|
| `GATEWAY_RATE_LIMIT_PER_MIN` | 120 | Requests per client IP per minute |
| `PROXY_TIMEOUT_MS` | 15000 | How long to wait for a service before returning 504 |
| `SUBSCRIPTION_CACHE_TTL_MS` | 60000 | How long subscription status is remembered |

## Important: deployment

**The services must not be reachable from the internet.** Only the gateway should have a public address. The gateway's checks protect nothing if a client can call a service directly, skipping the gateway. On Render or Railway, give each service a private address and expose only the gateway.

Services still check login tokens themselves, so direct calls cannot bypass authentication. Subscription and admin checks in the services depend on the gateway being the only public route, though.

## Known limits

- **Body size is checked from the `Content-Length` header only.** A chunked upload with no length header is not measured at the gateway. The services' own parsers still limit it.
- **The gateway does not parse request bodies.** Files and JSON pass through unchanged. Body validation stays in each service.
- **Services do not yet read `x-user-id` from the gateway.** They verify the token themselves. The headers are there for later use.
- **Rate limits are per gateway instance.** With several gateway instances, the effective limit is higher than the number shown. A shared store (for example Redis) would fix this later.

## Tests

```bash
npx jest gateway     # from backend/
```

The tests start small fake services that echo what they receive, so they check the real forwarding behaviour, including stripped headers, timeouts, dropped connections, and size limits.

## Library note

The proxy is `http-proxy-middleware` v3. Version 4 is ESM-only, and this project runs on CommonJS. Move to v4 only if the whole project moves to ESM.
