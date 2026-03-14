import dotenv from "dotenv";
import path from "path";
import url from "url";

dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

/**
 * Parse Redis connection from REDIS_URL (Railway format) or individual vars.
 * Railway provides REDIS_URL like: redis://default:password@host:port
 */
function parseRedis(): { host: string; port: number; password?: string } {
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    const parsed = new url.URL(redisUrl);
    return {
      host: parsed.hostname,
      port: parseInt(parsed.port, 10) || 6379,
      password: parsed.password || undefined,
    };
  }
  return {
    host: optional("REDIS_HOST", "127.0.0.1"),
    port: parseInt(optional("REDIS_PORT", "6379"), 10),
    password: process.env.REDIS_PASSWORD || undefined,
  };
}

/**
 * Auto-detect BASE_URL on Railway from RAILWAY_PUBLIC_DOMAIN.
 */
function getBaseUrl(): string {
  if (process.env.BASE_URL) return process.env.BASE_URL;
  const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN;
  if (railwayDomain) return `https://${railwayDomain}`;
  return `http://localhost:${optional("PORT", "3000")}`;
}

/**
 * On Railway, auto-enable webhooks when a public domain is detected.
 */
function useWebhook(): boolean {
  if (process.env.USE_WEBHOOK) return process.env.USE_WEBHOOK === "true";
  return !!process.env.RAILWAY_PUBLIC_DOMAIN;
}

export const config = {
  telegram: {
    token: required("TELEGRAM_BOT_TOKEN"),
    useWebhook: useWebhook(),
  },

  server: {
    port: parseInt(optional("PORT", "3000"), 10),
    baseUrl: getBaseUrl(),
  },

  elevenlabs: {
    apiKey: required("ELEVENLABS_API_KEY"),
    defaultVoiceId: optional("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM"),
  },

  replicate: {
    apiToken: optional("REPLICATE_API_TOKEN", ""),
  },

  did: {
    apiKey: optional("DID_API_KEY", ""),
  },

  lipsync: {
    provider: optional("LIPSYNC_PROVIDER", "replicate") as
      | "replicate"
      | "did",
  },

  redis: parseRedis(),

  storage: {
    // Railway has ephemeral filesystem — use /tmp for temp files
    dir: path.resolve(optional("STORAGE_DIR", "/tmp/avatar-bot-storage")),
    s3: {
      endpoint: process.env.S3_ENDPOINT || "",
      bucket: process.env.S3_BUCKET || "",
      accessKey: process.env.S3_ACCESS_KEY || "",
      secretKey: process.env.S3_SECRET_KEY || "",
      region: optional("S3_REGION", "us-east-1"),
    },
  },

  limits: {
    maxScriptLength: parseInt(optional("MAX_SCRIPT_LENGTH", "2000"), 10),
    maxConcurrentJobs: parseInt(optional("MAX_CONCURRENT_JOBS", "3"), 10),
    jobTimeoutMs: parseInt(optional("JOB_TIMEOUT_MS", "300000"), 10),
  },
} as const;
