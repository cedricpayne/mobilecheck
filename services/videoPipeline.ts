import { generateSpeech } from "./elevenlabs";
import { generateTalkingAvatar, LipsyncProvider } from "./avatarGenerator";
import { convertToTelegramVideo } from "../utils/ffmpeg";
import { generateFilename, getStoragePath, cleanupFiles } from "../utils/fileStorage";
import { logger } from "../utils/logger";

export interface VideoPipelineInput {
  imagePath: string;
  script: string;
  voiceId?: string;
  lipsyncProvider?: LipsyncProvider;
}

export interface VideoPipelineResult {
  videoPath: string;
  intermediateFiles: string[];
}

/**
 * Full pipeline: script → voice → lip-sync → Telegram-ready video.
 */
export async function runVideoPipeline(
  input: VideoPipelineInput
): Promise<VideoPipelineResult> {
  const intermediateFiles: string[] = [];

  try {
    // Step 1: Generate voice audio from script
    logger.info("Pipeline step 1: Generating voice audio...");
    const audioPath = await generateSpeech(input.script, input.voiceId);
    intermediateFiles.push(audioPath);

    // Step 2: Generate lip-sync video
    logger.info("Pipeline step 2: Generating lip-sync video...");
    const { videoPath: rawVideoPath } = await generateTalkingAvatar(
      input.imagePath,
      audioPath,
      input.lipsyncProvider
    );
    intermediateFiles.push(rawVideoPath);

    // Step 3: Convert to Telegram-compatible format
    logger.info("Pipeline step 3: Converting to Telegram format...");
    const finalFilename = generateFilename("mp4");
    const finalPath = getStoragePath("video", `final_${finalFilename}`);
    await convertToTelegramVideo(rawVideoPath, finalPath);

    logger.info(`Pipeline complete: ${finalPath}`);

    return {
      videoPath: finalPath,
      intermediateFiles,
    };
  } catch (error) {
    // Cleanup intermediate files on failure
    await cleanupFiles(intermediateFiles);
    throw error;
  }
}

/**
 * Cleanup all files from a pipeline run (call after sending to user).
 */
export async function cleanupPipelineResult(
  result: VideoPipelineResult
): Promise<void> {
  const allFiles = [...result.intermediateFiles, result.videoPath];
  await cleanupFiles(allFiles);
}
