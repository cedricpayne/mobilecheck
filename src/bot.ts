import TelegramBot from "node-telegram-bot-api";
import axios from "axios";
import fs from "fs";
import { config } from "../config/env";
import { sessionManager } from "./sessionManager";
import {
  addVideoJob,
  onJobComplete,
  onJobFailed,
  getQueueSize,
} from "./jobQueue";
import { cleanupPipelineResult } from "../services/videoPipeline";
import { VOICE_OPTIONS } from "../services/elevenlabs";
import { saveBuffer, cacheAvatar, getCachedAvatar } from "../utils/fileStorage";
import { logger } from "../utils/logger";

let bot: TelegramBot;

// Track active direct-processing jobs to prevent duplicates
const activeJobs = new Set<number>();

export function createBot(): TelegramBot {
  if (config.telegram.useWebhook) {
    bot = new TelegramBot(config.telegram.token, { webHook: true });
  } else {
    bot = new TelegramBot(config.telegram.token, { polling: true });
  }

  registerHandlers();
  registerQueueCallbacks();

  logger.info("Telegram bot initialized");
  return bot;
}

export function getBot(): TelegramBot {
  return bot;
}

function registerHandlers(): void {
  bot.onText(/\/start/, handleStart);
  bot.onText(/\/avatar/, handleAvatar);
  bot.onText(/\/voices/, handleVoices);
  bot.onText(/\/cancel/, handleCancel);
  bot.onText(/\/status/, handleStatus);
  bot.on("photo", handlePhoto);
  bot.on("text", handleText);
}

function registerQueueCallbacks(): void {
  onJobComplete(async (userId, chatId, result) => {
    try {
      await bot.sendVideo(chatId, result.videoPath, {
        caption: "Here's your avatar video!",
      });

      await cleanupPipelineResult({
        videoPath: result.videoPath,
        intermediateFiles: result.intermediateFiles,
      });
    } catch (err) {
      logger.error(`Failed to send video to user ${userId}:`, err);
      await bot.sendMessage(
        chatId,
        "Sorry, there was an error sending your video. Please try again with /avatar."
      );
    } finally {
      sessionManager.delete(userId);
      activeJobs.delete(userId);
    }
  });

  onJobFailed(async (userId, chatId, error) => {
    logger.error(`Job failed for user ${userId}: ${error}`);
    await bot.sendMessage(
      chatId,
      `Sorry, video generation failed: ${error}\n\nPlease try again with /avatar.`
    );
    sessionManager.delete(userId);
    activeJobs.delete(userId);
  });
}

// --- Command Handlers ---

async function handleStart(msg: TelegramBot.Message): Promise<void> {
  const chatId = msg.chat.id;

  await bot.sendMessage(
    chatId,
    `*Welcome to Avatar Video Bot!* 🎬

I can create talking avatar videos from your photos.

*How it works:*
1. Send /avatar to start
2. Upload a clear face photo
3. Type the script you want your avatar to say
4. Choose a voice (optional)
5. I'll generate your talking avatar video!

*Commands:*
/avatar - Start creating an avatar video
/voices - See available voices
/cancel - Cancel current session
/status - Check job queue status

*Tips:*
• Use a clear, front-facing photo for best results
• Keep scripts under ${config.limits.maxScriptLength} characters
• Processing takes 1-3 minutes`,
    { parse_mode: "Markdown" }
  );
}

async function handleAvatar(msg: TelegramBot.Message): Promise<void> {
  const userId = msg.from!.id;
  const chatId = msg.chat.id;

  if (activeJobs.has(userId)) {
    await bot.sendMessage(
      chatId,
      "You already have a video being processed. Please wait for it to finish or use /cancel."
    );
    return;
  }

  // Check for cached avatar
  const cached = getCachedAvatar(userId);
  const cacheNote = cached
    ? "\n\n_You have a cached avatar. Send a new photo or type \"use cached\" to reuse it._"
    : "";

  sessionManager.create(userId, chatId);

  await bot.sendMessage(
    chatId,
    `*Let's create your avatar video!*\n\nPlease send me a clear, front-facing photo of the person you want to animate.${cacheNote}`,
    { parse_mode: "Markdown" }
  );
}

async function handleVoices(msg: TelegramBot.Message): Promise<void> {
  const voiceList = VOICE_OPTIONS.map(
    (v, i) => `${i + 1}. ${v.name}`
  ).join("\n");

  await bot.sendMessage(
    msg.chat.id,
    `*Available Voices:*\n\n${voiceList}\n\nDuring avatar creation, you can pick a voice by number or name.`,
    { parse_mode: "Markdown" }
  );
}

async function handleCancel(msg: TelegramBot.Message): Promise<void> {
  const userId = msg.from!.id;
  sessionManager.delete(userId);
  activeJobs.delete(userId);
  await bot.sendMessage(msg.chat.id, "Session cancelled. Use /avatar to start again.");
}

async function handleStatus(msg: TelegramBot.Message): Promise<void> {
  const queueSize = await getQueueSize();
  const session = sessionManager.get(msg.from!.id);
  const status = session
    ? `Your session: ${session.step}`
    : "No active session";

  await bot.sendMessage(
    msg.chat.id,
    `*Status*\nQueue: ${queueSize} job(s)\n${status}`,
    { parse_mode: "Markdown" }
  );
}

// --- Message Handlers ---

async function handlePhoto(msg: TelegramBot.Message): Promise<void> {
  const userId = msg.from!.id;
  const chatId = msg.chat.id;
  const session = sessionManager.get(userId);

  if (!session || session.step !== "awaiting_image") {
    return; // Ignore photos outside of avatar flow
  }

  const photos = msg.photo!;
  const largestPhoto = photos[photos.length - 1];

  try {
    await bot.sendMessage(chatId, "Downloading your photo...");

    const fileInfo = await bot.getFile(largestPhoto.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${config.telegram.token}/${fileInfo.file_path}`;

    const response = await axios.get(fileUrl, {
      responseType: "arraybuffer",
      timeout: 30000,
    });

    const imagePath = await saveBuffer(
      "images",
      Buffer.from(response.data),
      "png"
    );

    // Cache the avatar for future use
    await cacheAvatar(userId, imagePath);

    sessionManager.update(userId, {
      imagePath,
      step: "awaiting_script",
    });

    await bot.sendMessage(
      chatId,
      "Great photo! Now send me the script you want your avatar to read.\n\n_Keep it under " +
        config.limits.maxScriptLength +
        " characters for best results._",
      { parse_mode: "Markdown" }
    );
  } catch (err) {
    logger.error("Error downloading photo:", err);
    await bot.sendMessage(
      chatId,
      "Sorry, I couldn't download the photo. Please try sending it again."
    );
  }
}

async function handleText(msg: TelegramBot.Message): Promise<void> {
  const userId = msg.from!.id;
  const chatId = msg.chat.id;
  const text = msg.text || "";

  // Ignore commands (handled by onText)
  if (text.startsWith("/")) return;

  const session = sessionManager.get(userId);
  if (!session) return;

  switch (session.step) {
    case "awaiting_image":
      await handleAwaitingImageText(userId, chatId, text);
      break;
    case "awaiting_script":
      await handleScript(userId, chatId, text);
      break;
    case "awaiting_voice":
      await handleVoiceSelection(userId, chatId, text);
      break;
    case "processing":
      await bot.sendMessage(
        chatId,
        "Your video is being generated. Please wait..."
      );
      break;
  }
}

async function handleAwaitingImageText(
  userId: number,
  chatId: number,
  text: string
): Promise<void> {
  if (text.toLowerCase() === "use cached") {
    const cached = getCachedAvatar(userId);
    if (cached) {
      sessionManager.update(userId, {
        imagePath: cached,
        step: "awaiting_script",
      });
      await bot.sendMessage(
        chatId,
        "Using your cached avatar! Now send me the script you want your avatar to read."
      );
      return;
    }
    await bot.sendMessage(
      chatId,
      "No cached avatar found. Please send a photo."
    );
    return;
  }

  await bot.sendMessage(
    chatId,
    "Please send a *photo* (not text) for the avatar.",
    { parse_mode: "Markdown" }
  );
}

async function handleScript(
  userId: number,
  chatId: number,
  text: string
): Promise<void> {
  if (text.length > config.limits.maxScriptLength) {
    await bot.sendMessage(
      chatId,
      `Script is too long (${text.length} chars). Please keep it under ${config.limits.maxScriptLength} characters.`
    );
    return;
  }

  sessionManager.update(userId, { script: text, step: "awaiting_voice" });

  const voiceList = VOICE_OPTIONS.map(
    (v, i) => `${i + 1}. ${v.name}`
  ).join("\n");

  await bot.sendMessage(
    chatId,
    `*Choose a voice:*\n\n${voiceList}\n\nSend the number, or type "default" to use Rachel.`,
    { parse_mode: "Markdown" }
  );
}

async function handleVoiceSelection(
  userId: number,
  chatId: number,
  text: string
): Promise<void> {
  const session = sessionManager.get(userId)!;

  let voiceId = VOICE_OPTIONS[0].voiceId; // Default

  if (text.toLowerCase() !== "default") {
    const num = parseInt(text, 10);
    if (num >= 1 && num <= VOICE_OPTIONS.length) {
      voiceId = VOICE_OPTIONS[num - 1].voiceId;
    } else {
      // Try matching by name
      const match = VOICE_OPTIONS.find((v) =>
        v.name.toLowerCase().includes(text.toLowerCase())
      );
      if (match) {
        voiceId = match.voiceId;
      } else {
        await bot.sendMessage(
          chatId,
          "Invalid choice. Send a number (1-" +
            VOICE_OPTIONS.length +
            ') or "default".'
        );
        return;
      }
    }
  }

  const selectedVoice =
    VOICE_OPTIONS.find((v) => v.voiceId === voiceId)?.name || "Default";

  sessionManager.update(userId, {
    voiceId,
    step: "processing",
  });

  activeJobs.add(userId);

  await bot.sendMessage(
    chatId,
    `*Generating your avatar video...*\n\nVoice: ${selectedVoice}\nThis may take 1-3 minutes. I'll send you the video when it's ready!`,
    { parse_mode: "Markdown" }
  );

  // Submit the job
  try {
    const { queued, result } = await addVideoJob({
      userId,
      chatId,
      imagePath: session.imagePath!,
      script: session.script!,
      voiceId,
    });

    // If direct processing (no queue), handle result immediately
    if (!queued && result) {
      await bot.sendVideo(chatId, result.videoPath, {
        caption: "Here's your avatar video!",
      });

      await cleanupPipelineResult(result);
      sessionManager.delete(userId);
      activeJobs.delete(userId);
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    logger.error(`Pipeline error for user ${userId}:`, err);
    await bot.sendMessage(
      chatId,
      `Sorry, video generation failed: ${errorMsg}\n\nPlease try again with /avatar.`
    );
    sessionManager.delete(userId);
    activeJobs.delete(userId);
  }
}
