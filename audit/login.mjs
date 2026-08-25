// Re-login and refresh audit/state.json tokens without echoing secrets.
import { readFileSync, writeFileSync } from "node:fs";

const BASE = "http://localhost:4000";
const statePath = "d:/business-os/audit/state.json";
const state = JSON.parse(readFileSync(statePath, "utf8"));

const body = JSON.stringify({
  email: "fullaudit20260825@example.com",
  password: "password123",
  deviceId: "audit-relogin-" + Date.now(),
  deviceName: "AuditReLogin",
});

const res = await fetch(BASE + "/api/v1/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json", Accept: "application/json" },
  body,
});
const payload = await res.json();
if (res.status !== 200 || !payload.data?.accessToken) {
  console.error("LOGIN FAILED", res.status, JSON.stringify(payload));
  process.exit(1);
}
state.accessToken = payload.data.accessToken;
state.refreshToken = payload.data.refreshToken;
state.sessionId = payload.data.sessionId;
state.userId = payload.data.user.id;
state.businessId = payload.data.businessId;
writeFileSync(statePath, JSON.stringify(state, null, 4));
console.log("LOGIN OK -> state.json refreshed");