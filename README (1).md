# StreamVault 🎮

> **Private live streaming. No signup. Instant links. End-to-end encrypted.**

StreamVault lets anyone go live instantly using a unique shareable link. No accounts, no friction — just low-latency, WebRTC-encrypted streams built for gaming, watch parties, and creators.

---

## ✨ Features

| Feature | Details |
|---|---|
| 🔐 **E2E Encryption** | WebRTC DTLS-SRTP by default via LiveKit |
| ⚡ **Sub-150ms latency** | LiveKit SFU with adaptive bitrate |
| 🔗 **Zero friction** | Unique links, no login/signup needed |
| 📺 **Multi-source** | Screen capture, webcam, or both |
| 📅 **Scheduling** | Schedule streams with date/time picker |
| ⏺️ **Recording** | Server-side recording toggle |
| 📡 **Social Crosspost** | One-click RTMP to YouTube & Instagram |
| 💬 **Live chat** | Reactions, viewer count, real-time messages |
| 🌙 **Dark mode** | Glassmorphism design, fully responsive |

---

## 🏗️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15, React 19, TypeScript, Tailwind CSS |
| Animation | Framer Motion |
| State | Zustand |
| Streaming | LiveKit (WebRTC SFU) |
| Real-time chat | Socket.io |
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL (prod) / SQLite (dev) via Prisma |
| Cache/Presence | Redis |
| Scheduling | node-cron |
| Email | Resend |
| SMS | Twilio |
| Deploy | Vercel (frontend), Render (backend) |

---

## 🏛️ Architecture

```
streamvault/
├── client/               # Next.js 15 + React 19 + Tailwind
│   ├── src/app/
│   │   ├── page.tsx          # Landing page
│   │   ├── host/             # Stream creation + dashboard
│   │   └── s/[roomId]/       # Viewer page
│   ├── src/components/
│   │   ├── StreamPlayer.tsx
│   │   ├── HostControls.tsx
│   │   ├── ChatPanel.tsx
│   │   ├── ScheduleModal.tsx
│   │   └── RtmpModal.tsx
│   └── src/store/stream.ts   # Zustand state
│
├── server/               # Node.js + Express + Socket.io
│   ├── src/routes/
│   │   ├── streams.ts    # CRUD for streams
│   │   ├── token.ts      # LiveKit JWT tokens
│   │   ├── egress.ts     # Recording / RTMP
│   │   └── reminders.ts  # Email/SMS reminders
│   ├── src/lib/
│   │   ├── livekit-server.ts
│   │   ├── socket.ts     # Socket.io handlers
│   │   └── redis.ts      # Viewer presence
│   ├── src/jobs/
│   │   └── scheduler.ts  # Cron: reminders + cleanup
│   └── prisma/schema.prisma
│
└── docker-compose.yml    # LiveKit + Redis + PostgreSQL
```

**Data flow:**
```
Host Browser ──[WebRTC/DTLS-SRTP]──▶ LiveKit SFU ──▶ Viewer Browsers
     │                                    │
     ▼                                    ▼
Express API ◀──▶ Prisma/PostgreSQL    Egress → RTMP (YouTube/Instagram)
     │
  Socket.io ──▶ Chat / Reactions / Viewer Count (via Redis)
```

---

## 🚀 Quick Start (Local Development)

### Prerequisites

- Node.js 20+
- Docker Desktop
- LiveKit Cloud account (free) — [cloud.livekit.io](https://cloud.livekit.io)

### 1. Clone & Install

```bash
git clone https://github.com/Sksahilkhan67sh/streamvault.git
cd streamvault
npm install --legacy-peer-deps
```

### 2. Configure Environment

```bash
# Server env
copy .env.example server\.env

# Client env
copy client\.env.local.example client\.env.local
```

Edit `server\.env` with your LiveKit credentials:

```env
DATABASE_URL="file:./dev.db"
REDIS_URL=redis://localhost:6379
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your_api_key
LIVEKIT_API_SECRET=your_api_secret
CLIENT_URL=http://localhost:3000
PORT=4000
NODE_ENV=development
```

Edit `client\.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_LIVEKIT_URL=wss://your-project.livekit.cloud
```

### 3. Start Infrastructure

```bash
docker compose up redis -d
```

### 4. Set Up Database

```bash
cd server
npm install --legacy-peer-deps
npx prisma generate
npx prisma db push
cd ..
```

### 5. Run Development Servers

Open two terminals:

**Terminal 1 — Server:**
```bash
cd server
npm run dev
```

**Terminal 2 — Client:**
```bash
cd client
npm run dev
```

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:4000 |
| Health check | http://localhost:4000/health |

---

## 🔑 Environment Variables

### Server (`server/.env`)

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL or SQLite connection string |
| `REDIS_URL` | ✅ | Redis connection (viewer presence) |
| `LIVEKIT_URL` | ✅ | LiveKit server WebSocket URL |
| `LIVEKIT_API_KEY` | ✅ | LiveKit API key |
| `LIVEKIT_API_SECRET` | ✅ | LiveKit API secret |
| `CLIENT_URL` | ✅ | Frontend URL (for CORS) |
| `PORT` | ❌ | Server port (default: 4000) |
| `RESEND_API_KEY` | ❌ | Email reminders via Resend |
| `TWILIO_ACCOUNT_SID` | ❌ | SMS reminders via Twilio |
| `TWILIO_AUTH_TOKEN` | ❌ | Twilio auth token |
| `TWILIO_PHONE_NUMBER` | ❌ | Twilio sender phone |

### Client (`client/.env.local`)

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | ✅ | Backend API URL |
| `NEXT_PUBLIC_APP_URL` | ❌ | Frontend URL (for link generation) |
| `NEXT_PUBLIC_LIVEKIT_URL` | ✅ | LiveKit WebSocket URL |

---

## 🎥 Usage Guide

### Creating a Stream

1. Go to `/host`
2. Enter a stream title
3. Optionally set a password
4. Click **"🔴 Create Stream"** to go live now, or **"Schedule"** tab to schedule
5. Copy the **viewer link** and share it

### Going Live

In the host dashboard:
1. Wait for **🟢 Connected** status in the top bar
2. Click **Camera** or **Screen** to start capturing
3. Toggle **Mic** to mute/unmute
4. Click **"Go Social"** to simultaneously stream to YouTube or Instagram
5. Click **"End Stream"** when done

### Viewer Experience

- Visit the shared link
- Enter an optional nickname
- If password-protected, enter the password
- Chat, react with emojis, watch fullscreen

### Streaming to YouTube / Instagram

1. Go live first (Camera or Screen)
2. Click **"Go Social"** button
3. Select **YouTube** or **Instagram**
4. Paste your stream key
5. Click **"Go Live on [Platform]"**

**Getting stream keys:**
- **YouTube:** [studio.youtube.com](https://studio.youtube.com) → Go Live → Stream tab
- **Instagram:** Instagram app → + → Live → ⚙️ → Advanced Settings

---

## 🛰️ Deployment (Free)

### Frontend → Vercel

1. Go to [vercel.com](https://vercel.com) → import your GitHub repo
2. Set Root Directory to `client`
3. Add environment variables
4. Deploy

### Backend → Render

1. Go to [render.com](https://render.com) → New Web Service
2. Connect GitHub repo, set Root Directory to `server`
3. Build command: `npm install --legacy-peer-deps && npx prisma generate && npm run build`
4. Start command: `node dist/index.js`
5. Add PostgreSQL and Redis plugins
6. Add environment variables

### Full Stack → Docker

```bash
docker compose up -d --build
```

---

## 🔐 Security

- **WebRTC DTLS-SRTP** — all media encrypted in transit
- **JWT-scoped room tokens** — viewers get read-only tokens
- **Link expiry** — links expire after 24h by default
- **No persistent users** — viewer sessions are ephemeral
- **Rate limiting** — 100 requests per 15 minutes
- **Password protection** — optional, hashed server-side

---

## 🤝 Contributing

1. Fork the repo
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Commit your changes: `git commit -m "feat: add something"`
4. Push and open a PR

---

## 📄 License

MIT — do whatever you want.

---

Built with ❤️ using [LiveKit](https://livekit.io), [Next.js](https://nextjs.org), and [Socket.io](https://socket.io)
