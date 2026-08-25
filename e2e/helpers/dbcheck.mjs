// Verify which DB the e2e helper (server/.env MONGODB_URI) actually sees.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const here = dirname(fileURLToPath(import.meta.url));
const requireFromServer = createRequire(join(here, "../../server/package.json"));
const mongoose = requireFromServer("mongoose");
const envText = readFileSync(join(here, "../../server/.env"), "utf8");
const line = envText.split(/\r?\n/).find((l) => l.startsWith("MONGODB_URI="));
const uri = line.slice("MONGODB_URI=".length).trim();
// Redact for display
const redactedUri = uri.replace(/\/\/[^:]+:[^@]+@/, "//***:***@");
console.log("MONGODB_URI:", redactedUri);
const dbNameMatch = uri.match(/\/([^/?]+)(\?|$)/);
console.log("Apparent db name from URI:", dbNameMatch?.[1]);
await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
const db = mongoose.connection.db;
console.log("Connected DB name (as seen by server mongoose):", db.databaseName);
for (const col of ["users", "devices", "refreshtokens", "auditlogs", "businesses"]) {
  try {
    const n = await db.collection(col).countDocuments();
    console.log(`  count ${col} = ${n}`);
  } catch (e) { console.log("  count", col, "ERR", e.message); }
}
const u = await db.collection("users").findOne({ email: "01700cbc88401@placeholder.local" });
console.log("User with E2E email found by server mongoose:", u ? `YES _id=${String(u._id)} status=${u.status}` : "NO");
await mongoose.disconnect();
