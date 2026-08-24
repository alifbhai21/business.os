import "dotenv/config";
import http from "http";
import { app, env } from "./app";
import { connectDB, disconnectDB } from "./db/connect";
import { logger } from "./utils/logger";

/** Graceful-shutdown budget: in-flight requests get 10s before force exit. */
const SHUTDOWN_TIMEOUT_MS = 10_000;

type SentryLike = {
  init: (opts: { dsn: string; environment?: string }) => void;
  captureException: (err: unknown) => void;
};

/**
 * Phase 14 — optional Sentry error tracking.
 *
 * Activation is entirely credential-driven: without SENTRY_DSN nothing is
 * imported or initialized (zero overhead locally / in CI). With a DSN the
 * SDK captures uncaught exceptions and unhandled rejections so production
 * crashes surface with stack traces.
 */
let sentry: SentryLike | null = null;

async function initSentry(): Promise<void> {
  if (!env.SENTRY_DSN) {
    logger.info("Sentry not configured (set SENTRY_DSN to enable error tracking)");
    return;
  }
  try {
    const mod = await import("@sentry/node");
    const Sentry = (mod.default ?? mod) as unknown as SentryLike;
    Sentry.init({ dsn: env.SENTRY_DSN, environment: env.NODE_ENV });
    sentry = Sentry;
    logger.info("Sentry error tracking initialized");
  } catch (err) {
    // Never let monitoring break startup.
    logger.error(`Sentry initialization failed: ${(err as Error).message}`);
  }
}

function reportCrash(err: unknown): void {
  logger.error(`CRASH ${String((err as Error)?.stack ?? err)}`);
  sentry?.captureException(err);
}

function shutdownGracefully(server: http.Server, signal: string): void {
  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`${signal} received — shutting down gracefully`);
    const forced = setTimeout(() => {
      logger.error("Graceful shutdown timed out — forcing exit");
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    server.close(() => {
      clearTimeout(forced);
      disconnectDB()
        .catch((err) => logger.error(`Error during DB disconnect: ${(err as Error).message}`))
        .finally(() => process.exit(0));
    });
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

async function main() {
  await initSentry();

  // Phase 14 — crash reporting safety net. These handlers exist only to log
  // (and forward to Sentry); they do not swallow errors: an uncaught
  // exception still terminates the process AFTER being recorded.
  process.on("unhandledRejection", (reason) => {
    reportCrash(reason);
  });
  process.on("uncaughtException", (err) => {
    reportCrash(err);
    process.exitCode = 1;
    setTimeout(() => process.exit(1), 100).unref();
  });

  try {
    await connectDB(env.DATABASE_URL ?? env.MONGODB_URI);
    const server = app.listen(env.PORT, () => {
      logger.info(`🚀 Server running on port ${env.PORT} (${env.NODE_ENV})`);
      logger.info(`   Health:  http://localhost:${env.PORT}/health`);
      logger.info(`   Ready:   http://localhost:${env.PORT}/ready`);
    });
    shutdownGracefully(server, "SIGTERM");
  } catch (err) {
    logger.error(`Failed to start server: ${(err as Error).message}`);
    process.exit(1);
  }
}

main();
