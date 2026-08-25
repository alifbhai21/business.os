import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Real MongoDB Atlas verification using the server's own mongoose install and
 * MONGODB_URI from server/.env. Values are never printed — only counts,
 * object ids and statuses.
 */

const here = dirname(fileURLToPath(import.meta.url));
const requireFromServer = createRequire(join(here, "../../server/package.json"));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const mongoose = requireFromServer("mongoose") as typeof import("mongoose");

function mongoUri(): string {
  const envText = readFileSync(join(here, "../../server/.env"), "utf8");
  const line = envText.split(/\r?\n/).find((l) => l.startsWith("MONGODB_URI="));
  if (!line) throw new Error("MONGODB_URI not found in server/.env");
  return line.slice("MONGODB_URI=".length).trim();
}

let connecting: Promise<typeof mongoose> | null = null;

async function db() {
  connecting =
    connecting ??
    mongoose.connect(mongoUri(), {
      serverSelectionTimeoutMS: 20_000,
      maxPoolSize: 5,
    });
  await connecting;
  return mongoose.connection.db!;
}

export async function closeMongo(): Promise<void> {
  if (mongoose.connection.readyState === 1) await mongoose.disconnect();
  connecting = null;
}

export async function findUserByEmail(email: string) {
  const d = await db();
  return d.collection("users").findOne({ email });
}

export async function membershipsFor(userId: string) {
  const d = await db();
  return d
    .collection("businessmemberships")
    .find({ userId: new mongoose.Types.ObjectId(userId) })
    .toArray();
}

export async function businessById(id: string) {
  const d = await db();
  return d.collection("businesses").findOne({ _id: new mongoose.Types.ObjectId(id) });
}

export async function shopsFor(businessId: string) {
  const d = await db();
  return d
    .collection("shops")
    .find({ businessId: new mongoose.Types.ObjectId(businessId) })
    .toArray();
}

export async function refreshTokensFor(userId: string) {
  const d = await db();
  return d
    .collection("refreshtokens")
    .find({ userId: new mongoose.Types.ObjectId(userId) })
    .sort({ createdAt: -1 })
    .limit(10)
    .toArray();
}

export async function devicesFor(userId: string) {
  const d = await db();
  return d.collection("devices").find({ userId: new mongoose.Types.ObjectId(userId) }).toArray();
}

export async function recentAuditLogsFor(userId: string, limit = 8) {
  const d = await db();
  return d
    .collection("auditlogs")
    .find({ userId: new mongoose.Types.ObjectId(userId) })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
}

export async function countByBusiness(collection: string, businessId: string, extra: Record<string, unknown> = {}) {
  const d = await db();
  return d
    .collection(collection)
    .countDocuments({ businessId: new mongoose.Types.ObjectId(businessId), ...extra });
}

export async function findOneByBusiness(collection: string, businessId: string, query: Record<string, unknown> = {}) {
  const d = await db();
  return d.collection(collection).findOne({
    businessId: new mongoose.Types.ObjectId(businessId),
    ...query,
  });
}
