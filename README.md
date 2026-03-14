# Telegram Avatar Video Bot

A Telegram bot that generates AI talking avatar videos from reference images with custom voice scripts. Designed to be deployed entirely from your phone via Railway.

## How It Works

1. Send `/avatar` in Telegram
2. Upload a face photo
3. Type the script you want the avatar to say
4. Pick a voice
5. Bot generates and sends back a talking avatar video

## Deploy from Mobile (Railway)

Everything below can be done from your phone — no laptop needed.

### Step 1: Get Your API Keys

You need 3 API keys. Get them from your phone's browser:

| Service | Where | What You Need |
|---------|-------|---------------|
| **Telegram Bot** | Open Telegram → message [@BotFather](https://t.me/BotFather) → `/newbot` | Copy the bot token |
| **ElevenLabs** | [elevenlabs.io](https://elevenlabs.io) → Sign up → Profile → API Key | Copy the API key |
| **Replicate** | [replicate.com](https://replicate.com) → Sign up → Account → API tokens | Copy the token |

### Step 2: Deploy on Railway

1. Open [railway.com](https://railway.com) on your phone
2. Sign up / log in (GitHub login works)
3. Tap **"New Project"** → **"Deploy from GitHub Repo"**
4. Connect your GitHub and select this repo
5. Railway will auto-detect the Dockerfile and start building

### Step 3: Add Redis

1. In your Railway project, tap **"+ New"** → **"Database"** → **"Redis"**
2. Railway automatically sets `REDIS_URL` — no config needed

### Step 4: Set Environment Variables

In your Railway project → click your service → **"Variables"** tab → add:

```
TELEGRAM_BOT_TOKEN=<your bot token from BotFather>
ELEVENLABS_API_KEY=<your ElevenLabs key>
REPLICATE_API_TOKEN=<your Replicate token>
LIPSYNC_PROVIDER=replicate
```

That's it. Railway auto-provides `PORT`, `REDIS_URL`, and `RAILWAY_PUBLIC_DOMAIN`. The bot auto-detects these and configures webhooks.

### Step 5: Generate a Public Domain

1. In Railway → your service → **"Settings"** tab
2. Under **"Networking"** → tap **"Generate Domain"**
3. You'll get something like `avatar-bot-production-xxxx.up.railway.app`
4. The bot auto-detects this and sets up Telegram webhooks

### Step 6: Use It

Open Telegram → find your bot → send `/start`.

## Bot Commands

| Command | What It Does |
|---------|-------------|
| `/start` | Welcome message and instructions |
| `/avatar` | Start creating an avatar video |
| `/voices` | List available voice options |
| `/cancel` | Cancel current session |
| `/status` | Check queue status |

## User Flow

```
/avatar → Upload Photo → Type Script → Pick Voice → Wait ~2 min → Get Video
```

## Architecture

```
Telegram ──→ Bot (Express/Webhook)
                │
                ├──→ ElevenLabs API (text → speech audio)
                │
                ├──→ Replicate SadTalker (image + audio → lip-sync video)
                │    (or D-ID as alternative)
                │
                └──→ FFmpeg (convert to Telegram-compatible MP4)
                │
                └──→ Telegram (send video back)

BullMQ + Redis ──→ Job queue (prevents overload, handles concurrency)
```

## Project Structure

```
├── src/
│   ├── server.ts          # Express + entry point
│   ├── bot.ts             # Telegram command/message handlers
│   ├── sessionManager.ts  # Per-user conversation state
│   └── jobQueue.ts        # BullMQ job queue (Redis)
├── services/
│   ├── elevenlabs.ts      # ElevenLabs TTS
│   ├── avatarGenerator.ts # Replicate SadTalker / D-ID lip-sync
│   └── videoPipeline.ts   # Full generation pipeline
├── utils/
│   ├── ffmpeg.ts          # Video conversion
│   ├── fileStorage.ts     # Temp file management
│   └── logger.ts          # Winston logger
├── config/
│   └── env.ts             # Env config (auto-detects Railway)
├── railway.json           # Railway deployment config
├── Dockerfile
└── docker-compose.yml     # Local dev with Redis
```

## Railway-Specific Behavior

The bot auto-detects Railway and adapts:

- **`RAILWAY_PUBLIC_DOMAIN`** → auto-enables webhook mode, sets `BASE_URL`
- **`REDIS_URL`** → auto-connects to Railway Redis add-on
- **`PORT`** → Railway assigns dynamically
- **Ephemeral storage** → uses `/tmp` for temp files (cleaned up after sending)
- **Health check** → `GET /health` endpoint for Railway monitoring

## Running Locally (Optional)

If you also want to run on your machine:

```bash
cp .env.example .env
# Fill in your API keys

# Without Redis (direct processing):
npm install
npm run dev

# With Redis:
docker-compose up -d redis
npm run dev
```

## Available Voices

| # | Voice |
|---|-------|
| 1 | Rachel (Female) |
| 2 | Drew (Male) |
| 3 | Antoni (Male) |
| 4 | Bella (Female) |
| 5 | Elli (Female) |
| 6 | Josh (Male) |

## Lip-Sync Providers

| Provider | Set `LIPSYNC_PROVIDER=` | Pricing | Quality |
|----------|------------------------|---------|---------|
| **Replicate (SadTalker)** | `replicate` (default) | Pay-per-run (~$0.05/video) | Good |
| **D-ID** | `did` | Subscription | Higher |

## Costs

Approximate per-video costs:
- ElevenLabs: ~$0.01-0.03 (depends on script length)
- Replicate SadTalker: ~$0.05
- Railway: Free tier includes $5/month credit
- Redis on Railway: Included in free tier

**~$0.06-0.08 per video** on the default stack.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Bot not responding | Check `TELEGRAM_BOT_TOKEN` in Railway variables |
| No webhook | Ensure you generated a domain in Railway Settings → Networking |
| Video fails | Check `REPLICATE_API_TOKEN` is valid |
| Queue not working | Verify Redis add-on is connected in Railway |
| Build fails | Check Railway build logs for missing env vars |
