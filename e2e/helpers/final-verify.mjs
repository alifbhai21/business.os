// Final live-DB relationship verification (DB 'test' — the DB the running app uses).
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const here = dirname(fileURLToPath(import.meta.url));
const requireFromServer = createRequire(join(here, "../../server/package.json"));
const mongoose = requireFromServer("mongoose");
const envText = readFileSync(join(here, "../../server/.env"), "utf8");
const uri = envText.split(/\r?\n/).find((l) => l.startsWith("MONGODB_URI=")).slice("MONGODB_URI=".length).trim();
await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
const db = mongoose.connection.db;
console.log("[MONGO-FINAL] DB:", db.databaseName);

const creds = JSON.parse(readFileSync(join(here, "../.runtime/credentials.json"), "utf8"));
const user = await db.collection("users").findOne({ email: creds.email });
console.log("[MONGO-FINAL] user:", user ? `_id=${String(user._id)} status=${user.status}` : "NOT FOUND");

const mems = await db.collection("businessmemberships").find({ userId: user._id }).toArray();
console.log("[MONGO-FINAL] memberships:", mems.length);
for (const m of mems) {
  const biz = await db.collection("businesses").findOne({ _id: m.businessId });
  const shopCount = await db.collection("shops").countDocuments({ businessId: m.businessId });
  const prodCount = await db.collection("products").countDocuments({ businessId: m.businessId });
  const custCount = await db.collection("customers").countDocuments({ businessId: m.businessId });
  console.log(`  business=${String(biz?._id)} name=${biz?.name} role=${m.role} status=${m.status} shops=${shopCount} products=${prodCount} customers=${custCount}`);
}
const rts = await db.collection("refreshtokens").find({ userId: user._id }).toArray();
console.log("[MONGO-FINAL] refreshtokens:", rts.length, "revoked:", rts.filter((r) => r.revokedAt).length);
const audits = await db.collection("auditlogs").find({ userId: user._id }).sort({ createdAt: -1 }).limit(10).toArray();
console.log("[MONGO-FINAL] recent audit actions:", audits.map((a) => a.action).join(", "));
await mongoose.disconnect();
