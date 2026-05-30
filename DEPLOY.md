# StreamVault — Production Deployment Guide

## Prerequisites
- GitHub repo with this code
- Vercel account (free) — for the client
- Render account (free) — for the server
- Neon or Supabase account (free) — for PostgreSQL
- LiveKit Cloud account (free tier) — for WebRTC

---

## Step 1 — PostgreSQL Database

### Option A: Neon (recommended, generous free tier)
1. Go to https://neon.tech → New Project
2. Copy the **Connection string** (starts with `postgresql://`)
3. Add `?sslmode=require` to the end if not already present

### Option B: Supabase
1. Go to https://supabase.com → New Project
2. Settings → Database → Connection string → URI mode

---

## Step 2 — Redis (optional but recommended)

### Option: Upstash (free 10,000 commands/day)
1. Go to https://upstash.com → Create Database → Region: closest to Render
2. Copy the **REDIS_URL** — use the `rediss://` TLS version

---

## Step 3 — Deploy Server on Render

1. Go to https://render.com → New → Web Service
2. Connect your GitHub repo
3. Configure:
   - **Root Directory:** `server`
   - **Runtime:** Node
   - **Build Command:** `npm install && npx prisma generate && npm run build`
   - **Start Command:** `npx prisma migrate deploy && node dist/index.js`
4. Add Environment Variables (click "Add Environment Variable" for each):

```
NODE_ENV=production
PORT=4000
CLIENT_URL=https://YOUR-APP.vercel.app          ← fill after Vercel deploy
DATABASE_URL=postgresql://...                    ← from Step 1
REDIS_URL=rediss://...                           ← from Step 2 (optional)
LIVEKIT_URL=wss://YOUR-PROJECT.livekit.cloud
LIVEKIT_API_KEY=YOUR_KEY
LIVEKIT_API_SECRET=YOUR_SECRET

# Optional — for recording persistence (without S3, recordings reset on redeploy)
S3_BUCKET=
S3_ACCESS_KEY=
S3_SECRET_KEY=
S3_REGION=us-east-1
S3_ENDPOINT=                                     ← leave empty for AWS, fill for R2/B2

# Optional — for email/SMS reminders
RESEND_API_KEY=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
```

5. Click **Create Web Service**
6. Copy your Render URL: `https://your-backend.onrender.com`

---

## Step 4 — Deploy Client on Vercel

1. Go to https://vercel.com → New Project → Import your repo
2. Configure:
   - **Framework Preset:** Next.js
   - **Root Directory:** `client`
3. Add Environment Variables:

```
NEXT_PUBLIC_API_URL=https://your-backend.onrender.com   ← from Step 3
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app         ← your Vercel URL
NEXT_PUBLIC_LIVEKIT_URL=wss://your-project.livekit.cloud
```

4. Click **Deploy**
5. Copy your Vercel URL

---

## Step 5 — Update SERVER with Client URL

Go back to Render → your service → Environment:
- Update `CLIENT_URL` to your Vercel URL
- Click **Save Changes** → Render will redeploy automatically

---

## Step 6 — Keep Render Free Tier Alive (prevents 15-min sleep)

Render free tier sleeps after 15 minutes of inactivity, killing WebSocket connections.

**Fix with UptimeRobot (free):**
1. Go to https://uptimerobot.com → Add New Monitor
2. Monitor Type: HTTP(s)
3. URL: `https://your-backend.onrender.com/health`
4. Monitoring Interval: 5 minutes
5. Click **Create Monitor**

This keeps your server awake 24/7.

---

## Step 7 — Verify Everything Works

Check these URLs:
- `https://your-backend.onrender.com/health` → should return `{"status":"ok"}`
- `https://your-app.vercel.app` → should load the homepage
- Create a stream → go live → open viewer URL in another browser

---

## Troubleshooting

### "Stream not found" / API errors
→ Check `NEXT_PUBLIC_API_URL` in Vercel matches your Render URL exactly (no trailing slash)

### LiveKit not connecting
→ Verify `NEXT_PUBLIC_LIVEKIT_URL` in Vercel matches `LIVEKIT_URL` in Render
→ Re-generate LiveKit API key/secret if they were exposed in git commits

### Recordings not persisting
→ Without S3, recordings in `/tmp` are lost when Render restarts. Set up S3/R2 env vars.
→ Cloudflare R2 has a generous free tier (10GB storage, no egress fees)

### WebSocket disconnects frequently
→ Make sure UptimeRobot is pinging `/health` every 5 minutes (Step 6)
→ The client already auto-reconnects via socket.io-client defaults

### CORS errors in browser console
→ Make sure `CLIENT_URL` in Render exactly matches your Vercel URL (including https://)

### Prisma migration errors on startup
→ Check `DATABASE_URL` is correct and the PostgreSQL server is reachable
→ Run `npx prisma migrate status` locally pointing at your prod DB to debug
