// Auth edge-case flows against the throwaway user (authaudit20260825@example.com).
// Prints status/codes only; never prints tokens.
import { readFileSync, writeFileSync } from "node:fs";

const done = (msg, res, body) => console.log(msg, "-> HTTP", res.status, "| code:", body.error?.code ?? "OK", "|", body.error?.message ?? (body.data?.user ? "user:" + body.data.user.email : body.message ?? ""));

const call = async (path, method = "POST", body, token) => {
  const headers = { "Content-Type": "application/json", Accept: "application/json" };
  if (token) headers.Authorization = "Bearer " + token;
  const res = await fetch("http://localhost:4000" + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return [res, await res.json()];
};

const state = JSON.parse(readFileSync("d:/business-os/audit/state.json", "utf8"));
const A = state.authTest;
const getState = () => JSON.parse(readFileSync("d:/business-os/audit/state.json", "utf8"));
const saveState = (patch) => {
  const s = getState();
  Object.assign(s.authTest, patch);
  writeFileSync("d:/business-os/audit/state.json", JSON.stringify(s, null, 4));
};

const NEW_PASS = "newpass987";

// ---- Phase A: lockout (AUTH_MAX_LOGIN_ATTEMPTS=5) ----
let r, j;
for (let i = 1; i <= 5; i++) {
  [r, j] = await call("/api/v1/auth/login", "POST", { email: A.email, password: "wrongpass1", deviceId: "lock-" + i });
}
done("login wrong x5 (locked)", r, j);
[r, j] = await call("/api/v1/auth/login", "POST", { email: A.email, password: "wrongpass1", deviceId: "lock-extra" });
done("login wrong while locked", r, j);
[r, j] = await call("/api/v1/auth/login", "POST", { email: A.email, password: "password123", deviceId: "lock-correct" });
done("login CORRECT while locked (expect 401/423 locked)", r, j);

// ---- Phase B: forgot + reset ----
[r, j] = await call("/api/v1/auth/forgot-password", "POST", { email: A.email });
done("forgot-password", r, j);
const resetToken = j.data?.resetToken ?? null;
console.log("resetToken captured:", resetToken ? "yes (len " + resetToken.length + ")" : "NO");
saveState({ resetToken });
[r, j] = await call("/api/v1/auth/reset-password", "POST", { token: resetToken ?? "x", password: NEW_PASS });
done("reset-password new-pass", r, j);
[r, j] = await call("/api/v1/auth/reset-password", "POST", { token: resetToken ?? "x", password: NEW_PASS });
done("reset-password token REUSE", r, j);
[r, j] = await call("/api/v1/auth/login", "POST", { email: A.email, password: "password123", deviceId: "post-reset" });
done("login OLD password after reset", r, j);
[r, j] = await call("/api/v1/auth/login", "POST", { email: A.email, password: NEW_PASS, deviceId: "post-reset-new" });
done("login NEW password after reset", r, j);
state.authTest.accessToken = j.data?.accessToken ?? state.authTest.accessToken;
state.authTest.refreshToken = j.data?.refreshToken ?? state.authTest.refreshToken;
saveState({});
console.log("--> auth state refreshed (tokens stored, not printed)");

// ---- Phase C: refresh rotation + reuse ----
const rt1 = state.authTest.refreshToken;
[r, j] = await call("/api/v1/auth/refresh", "POST", { refreshToken: rt1, deviceId: "refresh-1" });
done("refresh #1 (rotates)", r, j);
const rt2 = j.data?.refreshToken;
console.log("refresh rotated:", !!rt2);
[r, j] = await call("/api/v1/auth/refresh", "POST", { refreshToken: rt1, deviceId: "refresh-1" });
done("refresh #2 REUSE old -> revoke-all", r, j);
if (rt2) {
  [r, j] = await call("/api/v1/auth/refresh", "POST", { refreshToken: rt2, deviceId: "refresh-2" });
  done("refresh with rotated token after reuse", r, j);
}

// ---- Phase D: logout ----
[r, j] = await call("/api/v1/auth/login", "POST", { email: A.email, password: NEW_PASS, deviceId: "logout-login" });
const tLogout = j.data?.refreshToken;
const aLogout = j.data?.accessToken;
console.log("logout prep login ok:", !!tLogout);
[r, j] = await call("/api/v1/auth/logout", "POST", { refreshToken: tLogout });
done("logout", r, j);
[r, j] = await call("/api/v1/auth/refresh", "POST", { refreshToken: tLogout, deviceId: "after-logout" });
done("refresh after logout", r, j);

// ---- Phase E: logout-all ----
[r, j] = await call("/api/v1/auth/login", "POST", { email: A.email, password: NEW_PASS, deviceId: "login-1" });
const tAll = j.data.refreshToken;
const aAll = j.data.accessToken;
done("login for logout-all", r, j);
[r, j] = await call("/api/v1/auth/logout-all", "POST", {}, aAll);
done("logout-all", r, j);
[r, j] = await call("/api/v1/auth/refresh", "POST", { refreshToken: tAll, deviceId: "after-lo" });
done("refresh after logout-all (any session)", r, j);

// ---- Phase F: generic ----
[r, j] = await call("/api/v1/auth/forgot-password", "POST", { email: "no-such-user@example.com" });
done("forgot unknown email (generic)", r, j);
console.log("resetToken for unknown user:", j.data?.resetToken ?? null);
[r, j] = await call("/api/v1/auth/reset-password", "POST", { token: "garbage-token", password: NEW_PASS });
done("reset with garbage token", r, j);