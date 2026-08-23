import "dotenv/config";
import { app, env } from "./app";
import { connectDB } from "./db/connect";
import { logger } from "./utils/logger";

async function main() {
  try {
    await connectDB(env.DATABASE_URL ?? env.MONGODB_URI);
    app.listen(env.PORT, () => {
      logger.info(`🚀 Server running on http://localhost:${env.PORT}`);
      logger.info(`   Health:  http://localhost:${env.PORT}/health`);
      logger.info(`   Ready:   http://localhost:${env.PORT}/ready`);
    });
  } catch (err) {
    logger.error(`Failed to start server: ${(err as Error).message}`);
    process.exit(1);
  }
}

main();