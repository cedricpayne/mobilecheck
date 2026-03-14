import { Queue, Worker, Job } from "bullmq";
import { config } from "../config/env";
import { runVideoPipeline, cleanupPipelineResult, VideoPipelineResult } from "../services/videoPipeline";
import { logger } from "../utils/logger";

export interface VideoJobData {
  userId: number;
  chatId: number;
  imagePath: string;
  script: string;
  voiceId?: string;
}

export interface VideoJobResult {
  videoPath: string;
  intermediateFiles: string[];
}

const QUEUE_NAME = "video-generation";

const redisConnection = {
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  maxRetriesPerRequest: null,
};

let videoQueue: Queue<VideoJobData, VideoJobResult> | null = null;
let videoWorker: Worker<VideoJobData, VideoJobResult> | null = null;

// Callback for when a job completes or fails
type JobCompleteCallback = (
  userId: number,
  chatId: number,
  result: VideoJobResult
) => void;
type JobFailedCallback = (
  userId: number,
  chatId: number,
  error: string
) => void;

let onComplete: JobCompleteCallback | null = null;
let onFailed: JobFailedCallback | null = null;

/**
 * Initialize the job queue. Returns false if Redis is unavailable (falls back to direct processing).
 */
export async function initQueue(): Promise<boolean> {
  try {
    videoQueue = new Queue<VideoJobData, VideoJobResult>(QUEUE_NAME, {
      connection: redisConnection,
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
      },
    });

    // Test connection
    await videoQueue.waitUntilReady();

    videoWorker = new Worker<VideoJobData, VideoJobResult>(
      QUEUE_NAME,
      async (job: Job<VideoJobData, VideoJobResult>) => {
        logger.info(`Processing job ${job.id} for user ${job.data.userId}`);

        const result = await runVideoPipeline({
          imagePath: job.data.imagePath,
          script: job.data.script,
          voiceId: job.data.voiceId,
        });

        return {
          videoPath: result.videoPath,
          intermediateFiles: result.intermediateFiles,
        };
      },
      {
        connection: redisConnection,
        concurrency: config.limits.maxConcurrentJobs,
      }
    );

    videoWorker.on("completed", (job) => {
      if (job && onComplete) {
        logger.info(`Job ${job.id} completed for user ${job.data.userId}`);
        onComplete(job.data.userId, job.data.chatId, job.returnvalue);
      }
    });

    videoWorker.on("failed", (job, err) => {
      if (job && onFailed) {
        logger.error(`Job ${job.id} failed for user ${job.data.userId}:`, err);
        onFailed(job.data.userId, job.data.chatId, err.message);
      }
    });

    logger.info("Job queue initialized with Redis");
    return true;
  } catch (err) {
    logger.warn("Redis unavailable, falling back to direct processing:", err);
    videoQueue = null;
    videoWorker = null;
    return false;
  }
}

/**
 * Register callbacks for job completion and failure.
 */
export function onJobComplete(callback: JobCompleteCallback): void {
  onComplete = callback;
}

export function onJobFailed(callback: JobFailedCallback): void {
  onFailed = callback;
}

/**
 * Add a video generation job to the queue.
 * If queue is unavailable, processes directly and returns the result.
 */
export async function addVideoJob(
  data: VideoJobData
): Promise<{ queued: boolean; result?: VideoPipelineResult }> {
  if (videoQueue) {
    await videoQueue.add("generate-video", data, {
      jobId: `video-${data.userId}-${Date.now()}`,
    });
    logger.info(`Job queued for user ${data.userId}`);
    return { queued: true };
  }

  // Direct processing fallback (no Redis)
  logger.info(`Processing directly for user ${data.userId} (no queue)`);
  const result = await runVideoPipeline({
    imagePath: data.imagePath,
    script: data.script,
    voiceId: data.voiceId,
  });
  return { queued: false, result };
}

/**
 * Get the current queue size.
 */
export async function getQueueSize(): Promise<number> {
  if (!videoQueue) return 0;
  const counts = await videoQueue.getJobCounts();
  return counts.waiting + counts.active;
}

/**
 * Graceful shutdown.
 */
export async function closeQueue(): Promise<void> {
  if (videoWorker) await videoWorker.close();
  if (videoQueue) await videoQueue.close();
}
