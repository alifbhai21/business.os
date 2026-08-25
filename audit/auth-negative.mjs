// Negative auth token tests: expired / malformed / wrong-secret JWTs.
// Computes tokens internally using the server's real secret (not printed).
import { readFileSync } from "node:fs";
const dotenv = readFileSync("d:/business-os/server/.env", "utf8");
const secretLine = dotenv.split(/\r?\n/).find((l) => l.startsWith("JWT_ACCESS_SECRET="));
const secret = secretLine.split("=")[1].trim();
const state = JSON.parse(readFileSync("d:/business-os/audit/state.json", "utf8"));
const jwt = (await import("jsonwebtoken")).default;

const userId = state.userId;
const claims = { userId, deviceId: "neg-dev", sessionId: "neg-sess" };

const expired = jwt.sign(claims, secret, { subject: userId, expiresIn: "-1s" });
const wrongSecret = jwt.sign(claims, "this-is-a-very-wrong-secret-1234567890", {
  subject: userId,
  expiresIn: "15m",
});
const malformed = "not.a.jwt";

const cases = [
  ["expired-token", expired],
  ["wrong-secret-token", wrongSecret],
  ["malformed-token", malformed],
  ["empty-header-token", "Basic abc"],
];

for (const [name, token] of cases) {
  const res = await fetch("http://localhost:4000/api/v1/auth/me", {
    headers: { Authorization: "Bearer " + token, Accept: "application/json" },
  });
  const body = await res.json();
  console.log(name, "-> HTTP", res.status, "| code:", body.error?.code, "| msg:", body.error?.message);
}