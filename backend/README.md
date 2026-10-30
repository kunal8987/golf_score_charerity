# Digital Heroes Backend

Monorepo: one API gateway, one shared package, six microservices. Node.js 20+, Express 5, MongoDB.

## Structure

```
backend/
├── shared/              @dh/shared: createService, startService, logger, errors, db helper
├── gateway/             single entry point; forwards /api/* to services
├── services/
│   ├── auth/            port 4001
│   ├── subscription/    port 4002
│   ├── score/           port 4003
│   ├── charity/         port 4004
│   ├── draw/            port 4005
│   └── winner/          port 4006
├── tests/
└── .env.example
```

## Setup (Day 1)

```bash
cd backend
npm install
cp .env.example .env     # then fill in values
```

## Run locally

Run the gateway and any service in separate terminals:

```bash
npm run dev:auth         # http://localhost:4001/health
npm run dev:gateway      # http://localhost:4000/health
```

Check the gateway forwards to a service: `curl http://localhost:4000/api/auth/health` should return the auth service's health response.

## Routing rule

The gateway mounts each service at its `/api/<name>` prefix and strips that prefix. A service therefore defines routes like `/signup`, and the gateway exposes them as `/api/auth/signup`.

## Conventions

- Every response: `{ success, data }` or `{ success: false, error: { message } }`.
- Services read config from the root `.env`. Do not set `PORT` in `.env`; each service has its own default port.
- Services use one MongoDB database but own their collections (see the Microservices sheet).
- Stripe webhook route needs the raw body, so mount it before `express.json()` (handled on Day 5).
