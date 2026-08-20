import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { logger } from "../utils/logger";

let mongoMem: MongoMemoryServer | null = null;

export async function connectDB(databaseUrl?: string): Promise<void> {
  let url = databaseUrl;
  let usingMemory = false;

  // If no DATABASE_URL is set, auto-start an in-memory MongoDB (per original README).
  if (!url) {
    logger.warn("⚠️  No DATABASE_URL set — starting in-memory MongoDB (data resets on restart)");
    mongoMem = await MongoMemoryServer.create();
    url = mongoMem.getUri("business-os");
    usingMemory = true;
  }

  try {
    await mongoose.connect(url);
    logger.info(`✅ MongoDB connected: ${usingMemory ? "(in-memory)" : url}`);
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
