import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { config } from "../config/env";
import { logger } from "./logger";

const SUBDIRS = ["images", "audio", "video", "cache"] as const;
type Subdir = (typeof SUBDIRS)[number];

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function initStorage(): void {
  for (const sub of SUBDIRS) {
    ensureDir(path.join(config.storage.dir, sub));
  }
  logger.info(`Storage initialized at ${config.storage.dir}`);
}

export function getStoragePath(subdir: Subdir, filename: string): string {
  return path.join(config.storage.dir, subdir, filename);
}

export function generateFilename(ext: string): string {
  return `${uuidv4()}.${ext}`;
}

export async function saveBuffer(
  subdir: Subdir,
  buffer: Buffer,
  ext: string
): Promise<string> {
  const filename = generateFilename(ext);
  const filepath = getStoragePath(subdir, filename);
  await fs.promises.writeFile(filepath, buffer);
  logger.info(`Saved file: ${filepath}`);
  return filepath;
}

export async function cleanupFile(filepath: string): Promise<void> {
  try {
    if (fs.existsSync(filepath)) {
      await fs.promises.unlink(filepath);
      logger.debug(`Cleaned up: ${filepath}`);
    }
  } catch (err) {
    logger.warn(`Failed to cleanup ${filepath}:`, err);
  }
}

export async function cleanupFiles(filepaths: string[]): Promise<void> {
  await Promise.all(filepaths.map(cleanupFile));
}

/** Get cached avatar path for a user, or null if not cached. */
export function getCachedAvatar(userId: number): string | null {
  const cachePath = getStoragePath("cache", `avatar_${userId}.png`);
  return fs.existsSync(cachePath) ? cachePath : null;
}

/** Cache an avatar image for a user. */
export async function cacheAvatar(
  userId: number,
  sourcePath: string
): Promise<string> {
  const cachePath = getStoragePath("cache", `avatar_${userId}.png`);
  await fs.promises.copyFile(sourcePath, cachePath);
  return cachePath;
}
