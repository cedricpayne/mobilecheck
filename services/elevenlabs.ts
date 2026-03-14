import axios from "axios";
import { config } from "../config/env";
import { saveBuffer } from "../utils/fileStorage";
import { logger } from "../utils/logger";

const API_BASE = "https://api.elevenlabs.io/v1";

export interface VoiceOption {
  voiceId: string;
  name: string;
}

/** Pre-configured voice options users can choose from. */
export const VOICE_OPTIONS: VoiceOption[] = [
  { voiceId: "21m00Tcm4TlvDq8ikWAM", name: "Rachel (Female)" },
  { voiceId: "29vD33N1CtxCmqQRPOHJ", name: "Drew (Male)" },
  { voiceId: "ErXwobaYiN019PkySvjV", name: "Antoni (Male)" },
  { voiceId: "EXAVITQu4vr4xnSDxMaL", name: "Bella (Female)" },
  { voiceId: "MF3mGyEYCl7XYWbV9V6O", name: "Elli (Female)" },
  { voiceId: "TxGEqnHWrfWFTfGW9XjX", name: "Josh (Male)" },
];

/**
 * Generate speech audio from text using ElevenLabs API.
 * Returns the path to the saved MP3 file.
 */
export async function generateSpeech(
  text: string,
  voiceId?: string
): Promise<string> {
  const voice = voiceId || config.elevenlabs.defaultVoiceId;

  logger.info(`Generating speech with voice ${voice}, text length: ${text.length}`);

  const response = await axios.post(
    `${API_BASE}/text-to-speech/${voice}`,
    {
      text,
      model_id: "eleven_monolingual_v1",
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.0,
        use_speaker_boost: true,
      },
    },
    {
      headers: {
        Accept: "audio/mpeg",
        "Content-Type": "application/json",
        "xi-api-key": config.elevenlabs.apiKey,
      },
      responseType: "arraybuffer",
      timeout: 60000,
    }
  );

  const audioBuffer = Buffer.from(response.data);
  const audioPath = await saveBuffer("audio", audioBuffer, "mp3");

  logger.info(`Speech generated: ${audioPath}`);
  return audioPath;
}

/** List available voices from ElevenLabs. */
export async function listVoices(): Promise<VoiceOption[]> {
  try {
    const response = await axios.get(`${API_BASE}/voices`, {
      headers: { "xi-api-key": config.elevenlabs.apiKey },
      timeout: 10000,
    });

    return response.data.voices.map(
      (v: { voice_id: string; name: string }) => ({
        voiceId: v.voice_id,
        name: v.name,
      })
    );
  } catch (err) {
    logger.warn("Failed to fetch voices from ElevenLabs, using defaults");
    return VOICE_OPTIONS;
  }
}
