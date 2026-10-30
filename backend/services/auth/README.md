# Auth Service (port 4001)

Signup, login, logout, profile, and admin user management. Reached through the gateway at `/api/auth/*`.

## Endpoints

| Method | Gateway path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/auth/signup` | Public | Create a subscriber. Optional `charityId`, `charityPercentage` (min 10) |
| POST | `/api/auth/login` | Public | Log in. Sets the `dh_token` httpOnly cookie |
| POST | `/api/auth/logout` | Public | Clear the cookie |
| GET | `/api/auth/me` | Any user | Current profile |
| PATCH | `/api/auth/me` | Any user | Update `name`, `charityId`, `charityPercentage` |
| GET | `/api/auth/users?page=1&limit=20` | Admin | List users |
| PATCH | `/api/auth/users/:id` | Admin | Update a user's `name` or `role` |

Every response uses `{ success, data }` or `{ success: false, error: { message } }`.

## Security

- Passwords: 8+ characters with at least one letter and one number; hashed with bcrypt (cost 12).
- Sessions: JWT (HS256, 7 days) in an httpOnly, SameSite=Lax cookie. Also accepts `Authorization: Bearer <token>`.
- Unknown fields are rejected, so `role` cannot be set at signup or in `PATCH /me`.
- Login returns the same error for a wrong password and an unknown email, and takes similar time for both.
- Login and signup are limited to 20 attempts per 15 minutes per client IP.
- Admins cannot remove their own admin role.

## Create the first admin

```bash
npm run create-admin -w services/auth -- admin@example.com "Admin Name" "Passw0rd123"
```

## Tests

```bash
npm test -w services/auth      # run from backend/, or: npx jest services/auth
```

The tests use an in-memory stand-in for the User model, so no database is needed.
