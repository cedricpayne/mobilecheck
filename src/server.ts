import express from "express";
import { config } from "../config/env";
import { createBot, getBot } from "./bot";
import { initQueue, closeQueue } from "./jobQueue";
import { initStorage } from "../utils/fileStorage";
import { logger } from "../utils/logger";

async function main(): Promise<void> {
  // Initialize storage directories
  initStorage();

  // Initialize job queue (Redis optional)
  const queueReady = await initQueue();
  if (queueReady) {
    logger.info("BullMQ job queue active");
  } else {
    logger.info("Running without job queue (direct processing mode)");
  }

  // Create the bot
  const bot = createBot();

  // Express server (for webhooks and health checks)
  const app = express();
  app.use(express.json());

  // Health check
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", queue: queueReady });
  });

  // Webhook endpoint
  if (config.telegram.useWebhook) {
    const webhookPath = `/webhook/${config.telegram.token}`;

    app.post(webhookPath, (req, res) => {
      bot.processUpdate(req.body);
      res.sendStatus(200);
    });

    const webhookUrl = `${config.server.baseUrl}${webhookPath}`;
    await bot.setWebHook(webhookUrl);
    logger.info(`Webhook set: ${webhookUrl}`);
  }

  // Start server
  app.listen(config.server.port, () => {
    logger.info(`Server running on port ${config.server.port}`);
    logger.info(
      `Mode: ${config.telegram.useWebhook ? "webhook" : "polling"}`
    );
    logger.info(`Lip-sync provider: ${config.lipsync.provider}`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down...`);
    await closeQueue();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.error("Fatal error:", err);
  process.exit(1);
});
