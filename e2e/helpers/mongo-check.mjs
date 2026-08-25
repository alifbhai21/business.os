// Read-only MongoDB Atlas verification helper.
// Loads credentials from server/.env (never printed). Prints redacted results only.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const requireFromServer = createRequire(new URL("../../server/package.json", import.meta.url));
const mongoose = requireFromServer("mongoose");

const envText = readFileSync(new URL("../../server/.env", import.meta.url), "utf8");
function envVal(name) {
  const line = envText.split(/\r?\n/).find((l) => l.startsWith(name + "="));
  return line ? line.slice(name.length + 1).trim() : null;
}

const uri = envVal("MONGODB_URI");
if (!uri) {
  console.error("MONGODB_URI missing in server/.env");
  process.exit(1);
}

await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
const db = mongoose.connection.db;

const mode = process.argv[2] || "users";

if (mode === "users") {
  const users = await db.collection("users").find({}).project({ email: 1, phone: 1, status: 1, lastLoginAt: 1 }).toArray();
  console.log(`[MONGO] users total: ${users.length}`);
  for (const u of users.slice(0, 25)) {
    console.log(`  email=${u.email} phone=${u.phone} status=${u.status} lastLogin=${u.lastLoginAt ?? "never"} _id=${u._id}`);
  }
} else if (mode === "user") {
  const email = process.argv[3];
  const u = await db.collection("users").findOne({ email });
  if (!u) { console.log(`[MONGO] user NOT found: ${email}`); process.exit(0); }
  console.log(`[MONGO] user found: id=${u._id} email=${u.email} phone=${u.phone} status=${u.status}`);
  console.log(`[MONGO]   failedLoginAttempts=${u.failedLoginAttempts ?? 0} lockedUntil=${u.lockedUntil ?? "null"}`);
  const mems = await db.collection("businessmemberships").find({ userId: u._id }).toArray();
  console.log(`[MONGO]   memberships: ${mems.length}`);
  for (const m of mems) {
    const b = await db.collection("businesses").findOne({ _id: m.businessId });
    console.log(`[MONGO]     business=${b?.name ?? "?"} (${m.businessId}) role=${m.role} status=${m.status}`);
    const shops = await db.collection("shops").find({ businessId: m.businessId }).toArray();
    for (const s of shops) console.log(`[MONGO]       shop=${s.name} (${s._id})`);
  }
} else if (mode === "tokens") {
  // args: --userId <id>  → refresh token / device / audit state for user
  const userId = new mongoose.Types.ObjectId(process.argv[3]);
  const rts = await db.collection("refreshtokens").countDocuments({ userId });
  const rtsActive = await db.collection("refreshtokens").countDocuments({ userId, revokedAt: null });
  const devices = await db.collection("devices").find({ userId }).toArray();
  const audits = await db.collection("auditlogs").find({ userId }).sort({ createdAt: -1 }).limit(6).toArray();
  console.log(`[MONGO] refreshtokens: total=${rts} active=${rtsActive}`);
  console.log(`[MONGO] devices: ${devices.length} -> ${devices.map((d) => `${d.deviceId}(${d.status})`).join(", ")}`);
  console.log(`[MONGO] recent auditlogs:`);
  for (const a of audits) console.log(`  ${a.action} @ ${a.createdAt?.toISOString?.() ?? a.createdAt}`);
} else if (mode === "counts") {
  const cols = ["products", "customers", "suppliers", "sales", "purchases", "notifications"];
  const bid = process.argv[3] ? new mongoose.Types.ObjectId(process.argv[3]) : null;
  for (const c of cols) {
    const q = bid ? { businessId: bid } : {};
    const n = await db.collection(c).countDocuments(q);
    console.log(`[MONGO] ${c}: ${n}${bid ? ` (business scoped)` : ""}`);
  }
}

await mongoose.disconnect();
