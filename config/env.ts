import dotenv from "dotenv";
import path from "path";

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

export const config = {
  telegram: {
    token: required("TELEGRAM_BOT_TOKEN"),
    useWebhook: optional("USE_WEBHOOK", "false") === "true",
  },

  server: {
    port: parseInt(optional("PORT", "3000"), 10),
    baseUrl: optional("BASE_URL", "http://localhost:3000"),
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

  redis: {
    host: optional("REDIS_HOST", "127.0.0.1"),
    port: parseInt(optional("REDIS_PORT", "6379"), 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },

  storage: {
    dir: path.resolve(optional("STORAGE_DIR", "./storage")),
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
