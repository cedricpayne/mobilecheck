# Telegram Avatar Video Bot

A Telegram bot that generates AI talking avatar videos from reference images with custom voice scripts.

## How It Works

1. User sends `/avatar` to start
2. User uploads a clear face photo
3. User types the script they want the avatar to say
4. User picks a voice
5. Bot generates a talking avatar video and sends it back

## Architecture

```
User → Telegram → Bot → ElevenLabs (TTS) → Replicate/D-ID (lip-sync) → FFmpeg → Telegram
```

- **ElevenLabs** – converts script text to natural speech audio
- **Replicate (SadTalker)** or **D-ID** – generates lip-synced talking head video from image + audio
- **FFmpeg** – converts output to Telegram-compatible MP4
- **BullMQ + Redis** – optional job queue for concurrent processing

## Prerequisites

- Node.js 18+
- FFmpeg installed (`apt install ffmpeg` or `brew install ffmpeg`)
- Redis (optional, for job queue – works without it in direct mode)

## Required API Keys

| Service | Get Key | Purpose |
|---------|---------|---------|
| Telegram Bot | [@BotFather](https://t.me/BotFather) | Bot token |
| ElevenLabs | [elevenlabs.io](https://elevenlabs.io) | Text-to-speech |
| Replicate | [replicate.com](https://replicate.com) | Lip-sync (SadTalker) |
| D-ID (alt) | [d-id.com](https://www.d-id.com) | Lip-sync (alternative) |

## Quick Start

### 1. Clone and install

```bash
git clone <repo-url>
cd telegram-avatar-video-bot
npm install
```

### 2. Configure

```bash
cp .env.example .env
# Edit .env with your API keys
```

Minimum required variables:
```
TELEGRAM_BOT_TOKEN=your_token
ELEVENLABS_API_KEY=your_key
REPLICATE_API_TOKEN=your_token
```

### 3. Run

```bash
# Development (polling mode)
npm run dev

# Production build
npm run build
npm start
```

### 4. Docker

```bash
# With Redis job queue
docker-compose up -d

# Or standalone
docker build -t avatar-bot .
docker run -d --env-file .env -p 3000:3000 avatar-bot
```

## Configuration

### Lip-sync Provider

Set `LIPSYNC_PROVIDER` in `.env`:

- `replicate` (default) – Uses SadTalker via Replicate. Good quality, pay-per-use.
- `did` – Uses D-ID API. Higher quality, subscription-based.

### Webhook vs Polling

- **Polling** (default): Set `USE_WEBHOOK=false`. Best for development.
- **Webhook**: Set `USE_WEBHOOK=true` and `BASE_URL=https://your-domain.com`. Best for production.

### Job Queue

Redis is optional. Without it, jobs process directly (one at a time per request). With Redis, jobs are queued via BullMQ with configurable concurrency.

```
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
MAX_CONCURRENT_JOBS=3
```

## Bot Commands

| Command | Description |
|---------|-------------|
| `/start` | Welcome message and instructions |
| `/avatar` | Start avatar creation flow |
| `/voices` | List available voices |
| `/cancel` | Cancel current session |
| `/status` | Check queue status |

## Project Structure

```
├── src/
│   ├── server.ts          # Express server + entry point
│   ├── bot.ts             # Telegram bot handlers
│   ├── sessionManager.ts  # Per-user session state
│   └── jobQueue.ts        # BullMQ job queue
├── services/
│   ├── elevenlabs.ts      # ElevenLabs TTS integration
│   ├── avatarGenerator.ts # Replicate/D-ID lip-sync
│   └── videoPipeline.ts   # Full generation pipeline
├── utils/
│   ├── ffmpeg.ts          # FFmpeg video operations
│   ├── fileStorage.ts     # File storage management
│   └── logger.ts          # Winston logger
├── config/
│   └── env.ts             # Environment configuration
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

## Deploy to VPS

### Option A: Docker (Recommended)

```bash
# On your VPS
git clone <repo-url>
cd telegram-avatar-video-bot
cp .env.example .env
# Edit .env with your keys

# Set webhook mode for production
echo "USE_WEBHOOK=true" >> .env
echo "BASE_URL=https://your-domain.com" >> .env

docker-compose up -d
```

### Option B: Direct

```bash
# Install dependencies
sudo apt update
sudo apt install -y nodejs npm ffmpeg redis-server

# Clone and setup
git clone <repo-url>
cd telegram-avatar-video-bot
npm install
npm run build

# Use PM2 for process management
npm install -g pm2
pm2 start dist/src/server.js --name avatar-bot
pm2 save
pm2 startup
```

### Reverse Proxy (Nginx)

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## Performance Notes

- Avatar caching: Photos are cached per user so they can reuse them with "use cached"
- Job queue prevents duplicate processing per user
- Stale sessions are automatically cleaned up after 1 hour
- Intermediate files are cleaned up after sending or on failure
- Configurable concurrency via `MAX_CONCURRENT_JOBS`

## Troubleshooting

- **Bot not responding**: Check `TELEGRAM_BOT_TOKEN` and that no other instance is running
- **Video generation fails**: Verify API keys for ElevenLabs and Replicate/D-ID
- **FFmpeg errors**: Ensure FFmpeg is installed (`ffmpeg -version`)
- **Queue not working**: Check Redis connection (`redis-cli ping`)
