import { logger } from "../utils/logger";

export type SessionStep =
  | "idle"
  | "awaiting_image"
  | "awaiting_script"
  | "awaiting_voice"
  | "processing";

export interface UserSession {
  userId: number;
  chatId: number;
  step: SessionStep;
  imagePath?: string;
  script?: string;
  voiceId?: string;
  avatarStyle?: string;
  createdAt: number;
  updatedAt: number;
}

class SessionManager {
  private sessions = new Map<number, UserSession>();

  /** Cleanup interval: remove stale sessions older than 1 hour. */
  private cleanupInterval: ReturnType<typeof setInterval>;

  constructor() {
    this.cleanupInterval = setInterval(() => this.cleanupStale(), 60 * 60 * 1000);
  }

  get(userId: number): UserSession | undefined {
    return this.sessions.get(userId);
  }

  create(userId: number, chatId: number): UserSession {
    const session: UserSession = {
      userId,
      chatId,
      step: "awaiting_image",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.sessions.set(userId, session);
    logger.debug(`Session created for user ${userId}`);
    return session;
  }

  update(userId: number, updates: Partial<UserSession>): UserSession | null {
    const session = this.sessions.get(userId);
    if (!session) return null;

    const updated = { ...session, ...updates, updatedAt: Date.now() };
    this.sessions.set(userId, updated);
    return updated;
  }

  delete(userId: number): void {
    this.sessions.delete(userId);
    logger.debug(`Session deleted for user ${userId}`);
  }

  isProcessing(userId: number): boolean {
    const session = this.sessions.get(userId);
    return session?.step === "processing";
  }

  private cleanupStale(): void {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    let cleaned = 0;
    for (const [userId, session] of this.sessions) {
      if (session.updatedAt < oneHourAgo && session.step !== "processing") {
        this.sessions.delete(userId);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      logger.info(`Cleaned up ${cleaned} stale sessions`);
    }
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.sessions.clear();
  }
}

export const sessionManager = new SessionManager();
