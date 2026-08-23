import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { logger } from "../utils/logger";

let mongoMem: MongoMemoryServer | null = null;

/** Mask credentials in a MongoDB URI so it can never leak into logs. */
function maskUri(uri: string): string {
  return uri.replace(/:\/\/[^@/]+@/, "://***:***@");
}

export async function connectDB(databaseUrl?: string): Promise<void> {
  let url = databaseUrl;
  let usingMemory = false;

  // If no DATABASE_URL/MONGODB_URI is set, auto-start an in-memory MongoDB (per original README).
  if (!url) {
    logger.warn("⚠️  No DATABASE_URL set — starting in-memory MongoDB (data resets on restart)");
    mongoMem = await MongoMemoryServer.create();
    url = mongoMem.getUri("business-os");
    usingMemory = true;
  }

  // Singleton guard: never open a second connection during dev watch mode / hot reload.
  if (!usingMemory && mongoose.connection.readyState === 1) {
    return;
  }

  try {
    await mongoose.connect(url);
    logger.info(`✅ MongoDB connected: ${usingMemory ? "(in-memory)" : maskUri(url)}`);
  } catch (err) {
    logger.error(`❌ MongoDB connection failed: ${(err as Error).message}`);
    throw err;
  }
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
  if (mongoMem) {
    await mongoMem.stop();
    mongoMem = null;
  }
  logger.info("MongoDB disconnected");
}
