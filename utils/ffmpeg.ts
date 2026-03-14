import ffmpeg from "fluent-ffmpeg";
import { logger } from "./logger";

/**
 * Get the duration of an audio file in seconds.
 */
export function getAudioDuration(audioPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(audioPath, (err, metadata) => {
      if (err) return reject(err);
      resolve(metadata.format.duration || 0);
    });
  });
}

/**
 * Combine a video stream and audio stream into a final MP4.
 */
export function mergeVideoAudio(
  videoPath: string,
  audioPath: string,
  outputPath: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(videoPath)
      .input(audioPath)
      .outputOptions([
        "-c:v libx264",
        "-c:a aac",
        "-b:a 192k",
        "-shortest",
        "-movflags +faststart",
        "-pix_fmt yuv420p",
      ])
      .output(outputPath)
      .on("start", (cmd) => logger.debug(`FFmpeg: ${cmd}`))
      .on("end", () => {
        logger.info(`Merged video: ${outputPath}`);
        resolve(outputPath);
      })
      .on("error", (err) => {
        logger.error("FFmpeg merge error:", err);
        reject(err);
      })
      .run();
  });
}

/**
 * Convert a video to Telegram-compatible MP4 format.
 */
export function convertToTelegramVideo(
  inputPath: string,
  outputPath: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .outputOptions([
        "-c:v libx264",
        "-preset fast",
        "-crf 23",
        "-c:a aac",
        "-b:a 128k",
        "-movflags +faststart",
        "-pix_fmt yuv420p",
        "-vf scale=trunc(iw/2)*2:trunc(ih/2)*2",
      ])
      .output(outputPath)
      .on("end", () => {
        logger.info(`Converted for Telegram: ${outputPath}`);
        resolve(outputPath);
      })
      .on("error", (err) => {
        logger.error("FFmpeg convert error:", err);
        reject(err);
      })
      .run();
  });
}

/**
 * Create a static video from an image with given duration.
 */
export function imageToVideo(
  imagePath: string,
  durationSecs: number,
  outputPath: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(imagePath)
      .inputOptions(["-loop 1"])
      .outputOptions([
        `-t ${durationSecs}`,
        "-c:v libx264",
        "-preset fast",
        "-crf 18",
        "-pix_fmt yuv420p",
        "-vf scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2",
        "-r 25",
      ])
      .output(outputPath)
      .on("end", () => resolve(outputPath))
      .on("error", reject)
      .run();
  });
}
