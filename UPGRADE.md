# StreamVault — Upgrade Guide

This document explains every change made in the v2 upgrade.

## What's New

### ✅ Phase 1 — Auth & Security
- **JWT Authentication** — `POST /api/auth/register`, `/login`, `/refresh`, `/logout`, `GET /me`
- **OAuth** — Google + GitHub via manual PKCE exchange (no Passport dependency)
- **RBAC** — `requireAuth`, `requireRole(...roles)`, `optionalAuth` middleware in `server/src/lib/auth.ts`
- **Refresh token rotation** — stored in DB, rotated on every refresh, invalidated on logout
- **Ban system** — `bannedAt` field on User, checked on login and token refresh

### ✅ Phase 1 — Role-Based Access Control
- Roles: `ADMIN`, `HOST`, `VIEWER`
- `requireRole('ADMIN')` guards all `/api/admin/*` routes
- `optionalAuth` on stream creation links streams to logged-in users via `hostId`
- Socket.IO personal rooms: `socket.on('auth', { userId })` → join `user:{userId}`

### ✅ Phase 1 — Analytics Dashboard
- New `StreamEvent` model tracks viewer joins/leaves, chat, reactions, polls
- `GET /api/analytics/:roomId` — returns metrics, timeline, poll stats
- Frontend at `/host/analytics/[roomId]` with mini charts, no chart library needed
- Peak viewers tracked in real-time on every join event

### ✅ Phase 1 — Admin Panel
- `/admin` page with tabs: Overview, Users, Streams, Reports
- Ban/unban users, change roles inline
- Force-delete streams (soft delete via `deletedAt`)
- Report queue with resolve action

### ✅ Phase 2 — Notifications
- `Notification` model with type, title, body, read status
- `GET /api/notifications`, `PATCH /read-all`, `PATCH /:id/read`
- `NotificationBell` component with unread badge and dropdown
- `notifyUser(userId, notification)` helper in socket.ts

### ✅ Phase 2 — Search & Discovery
- `/browse` page with full-text search, category filters, sort, live/upcoming filter
- `GET /api/streams?q=&category=&sort=&status=` query params
- `GET /api/streams/categories` returns category list

### ✅ Phase 2 — Categories & Tags
- `category` (string) and `tags` (string[]) added to Stream model
- Category picker and tags on stream creation form (update your host page)
- Shown on browse cards and stream pages

### ✅ Phase 3 — Cloud Deployment
- `server/Dockerfile` — multi-stage, FFmpeg pre-installed, ~120MB
- `client/Dockerfile` — Next.js standalone output
- `docker-compose.prod.yml` — Postgres + Redis + server + client with health checks
- `.github/workflows/ci.yml` — type-check + build + deploy to Railway + Vercel

### ✅ Phase 3 — AI Features
- **Chat moderation** — every chat message is classified by Claude before broadcast
  - Toxic messages rejected with feedback to sender only
  - Fails open (if API is down, messages pass through)
- **Stream summaries** — `POST /api/ai/summarize` generates 2-3 sentence summary from title + chat
  - Call this after a stream ends to populate `Recording.summary`

---

## Migration Steps

### 1. Install new dependencies
```bash
cd server && npm install
```

### 2. Update your database schema
```bash
# SQLite (dev) — push schema changes directly
cd server && npx prisma db push

# PostgreSQL (production) — create and run migration
cd server && npx prisma migrate dev --name "v2-auth-analytics"
```

### 3. Add new environment variables
Copy `server/.env.example` and fill in:
- `JWT_SECRET` — required, use a long random string
- `ANTHROPIC_API_KEY` — optional, enables AI moderation + summaries
- `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` — optional OAuth
- `GITHUB_CLIENT_ID` + `GITHUB_CLIENT_SECRET` — optional OAuth

### 4. Create first admin user
After registering your first account, manually set the role in the database:
```sql
UPDATE "User" SET role = 'ADMIN' WHERE email = 'your@email.com';
```
Or use Prisma Studio: `cd server && npx prisma studio`

### 5. Add browse link to your homepage
Add a link to `/browse` in your nav so users can discover streams.

### 6. Add NotificationBell to your nav
```tsx
import NotificationBell from '@/components/NotificationBell';
// In your nav:
<NotificationBell />
```

### 7. Add analytics link to HostControls
```tsx
<a href={`/host/analytics/${stream.roomId}?hostToken=${stream.hostToken}`}>
  View Analytics
</a>
```

---

## File Changes Summary

### New server files
- `src/lib/auth.ts` — JWT + RBAC middleware
- `src/routes/auth.ts` — register, login, refresh, OAuth
- `src/routes/admin.ts` — admin CRUD
- `src/routes/analytics.ts` — stream metrics API
- `src/routes/notifications.ts` — notification CRUD
- `src/routes/ai.ts` — chat moderation + summarization
- `Dockerfile`

### Modified server files
- `src/index.ts` — added new route registrations
- `src/lib/socket.ts` — analytics tracking + AI moderation + user rooms
- `src/routes/streams.ts` — search, categories, tags, hostId linking
- `prisma/schema.prisma` — User, RefreshToken, Follow, StreamEvent, Notification, Report models
- `package.json` — added `jsonwebtoken`, `@types/jsonwebtoken`, `@anthropic-ai/sdk`

### New client files
- `src/lib/auth.ts` — token helpers, apiFetch with auto-refresh
- `src/app/auth/login/page.tsx`
- `src/app/auth/register/page.tsx`
- `src/app/auth/callback/page.tsx`
- `src/app/admin/page.tsx`
- `src/app/browse/page.tsx`
- `src/app/host/analytics/[roomId]/page.tsx`
- `src/components/NotificationBell.tsx`
- `Dockerfile`

### New root files
- `docker-compose.prod.yml`
- `.github/workflows/ci.yml`
