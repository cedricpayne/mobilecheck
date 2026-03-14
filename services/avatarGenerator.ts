import axios from "axios";
import Replicate from "replicate";
import fs from "fs";
import { config } from "../config/env";
import { saveBuffer, generateFilename, getStoragePath } from "../utils/fileStorage";
import { logger } from "../utils/logger";

export type LipsyncProvider = "replicate" | "did";

export interface LipsyncResult {
  videoPath: string;
}

/**
 * Generate a talking avatar video using the configured lip-sync provider.
 */
export async function generateTalkingAvatar(
  imagePath: string,
  audioPath: string,
  provider?: LipsyncProvider
): Promise<LipsyncResult> {
  const selectedProvider = provider || config.lipsync.provider;

  logger.info(`Generating talking avatar with provider: ${selectedProvider}`);

  switch (selectedProvider) {
    case "replicate":
      return generateWithReplicate(imagePath, audioPath);
    case "did":
      return generateWithDID(imagePath, audioPath);
    default:
      throw new Error(`Unknown lip-sync provider: ${selectedProvider}`);
  }
}

/**
 * Use Replicate's SadTalker model for lip-sync video generation.
 */
async function generateWithReplicate(
  imagePath: string,
  audioPath: string
): Promise<LipsyncResult> {
  if (!config.replicate.apiToken) {
    throw new Error("REPLICATE_API_TOKEN is required for Replicate provider");
  }

  const replicate = new Replicate({ auth: config.replicate.apiToken });

  const imageData = fs.readFileSync(imagePath);
  const audioData = fs.readFileSync(audioPath);

  const imageBase64 = `data:image/png;base64,${imageData.toString("base64")}`;
  const audioBase64 = `data:audio/mpeg;base64,${audioData.toString("base64")}`;

  logger.info("Submitting SadTalker job to Replicate...");

  const output = await replicate.run(
    "cjwbw/sadtalker:3aa3dac9353571f8177510888e7e59afc0c35236083ec70d0e8d4b78d1243523",
    {
      input: {
        source_image: imageBase64,
        driven_audio: audioBase64,
        enhancer: "gfpgan",
        preprocess: "crop",
        still_mode: false,
      },
    }
  );

  // Replicate returns a URL to the output video
  const outputUrl = output as unknown as string;
  logger.info(`Replicate output URL: ${outputUrl}`);

  const videoResponse = await axios.get(outputUrl, {
    responseType: "arraybuffer",
    timeout: 120000,
  });

  const videoPath = await saveBuffer(
    "video",
    Buffer.from(videoResponse.data),
    "mp4"
  );

  logger.info(`Lip-sync video saved: ${videoPath}`);
  return { videoPath };
}

/**
 * Use D-ID API for talking avatar generation.
 */
async function generateWithDID(
  imagePath: string,
  audioPath: string
): Promise<LipsyncResult> {
  if (!config.did.apiKey) {
    throw new Error("DID_API_KEY is required for D-ID provider");
  }

  const imageData = fs.readFileSync(imagePath);
  const imageBase64 = imageData.toString("base64");

  const audioData = fs.readFileSync(audioPath);
  const audioBase64 = audioData.toString("base64");

  // Create a talk
  logger.info("Submitting talk job to D-ID...");
  const createResponse = await axios.post(
    "https://api.d-id.com/talks",
    {
      source_url: `data:image/png;base64,${imageBase64}`,
      script: {
        type: "audio",
        audio_url: `data:audio/mpeg;base64,${audioBase64}`,
      },
      config: {
        stitch: true,
      },
    },
    {
      headers: {
        Authorization: `Basic ${config.did.apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: 30000,
    }
  );

  const talkId = createResponse.data.id;
  logger.info(`D-ID talk created: ${talkId}`);

  // Poll for completion
  let resultUrl: string | null = null;
  for (let attempt = 0; attempt < 60; attempt++) {
    await sleep(5000);

    const statusResponse = await axios.get(
      `https://api.d-id.com/talks/${talkId}`,
      {
        headers: { Authorization: `Basic ${config.did.apiKey}` },
        timeout: 10000,
      }
    );

    const status = statusResponse.data.status;
    logger.debug(`D-ID talk ${talkId} status: ${status}`);

    if (status === "done") {
      resultUrl = statusResponse.data.result_url;
      break;
    }

    if (status === "error" || status === "rejected") {
      throw new Error(
        `D-ID talk failed: ${statusResponse.data.error?.description || status}`
      );
    }
  }

  if (!resultUrl) {
    throw new Error("D-ID talk timed out after 5 minutes");
  }

  const videoResponse = await axios.get(resultUrl, {
    responseType: "arraybuffer",
    timeout: 120000,
  });

  const videoPath = await saveBuffer(
    "video",
    Buffer.from(videoResponse.data),
    "mp4"
  );

  logger.info(`D-ID video saved: ${videoPath}`);
  return { videoPath };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
