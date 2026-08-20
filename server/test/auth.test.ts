import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { app } from "../src/app";
import { User } from "../src/models/User";
import { BusinessMembership } from "../src/models/BusinessMembership";
import { connectTestDb, disconnectTestDb } from "./helpers/db";

const DEV = { deviceId: "test-device", deviceName: "Jest", platform: "android", appVersion: "1.0.0" };

function regBody(over: Record<string, unknown> = {}) {
  return {
    name: "Test User",
    email: `user${Math.random().toString(36).slice(2)}@example.com`,
    phone: "017" + Math.floor(10000000 + Math.random() * 89999999),
    password: "password123",
    ...DEV,
    ...over,
  };
}

before(async () => {
  await connectTestDb("business-os-test-auth");
});

after(async () => {
  await disconnectTestDb();
});

// ── Registration ────────────────────────────────────────────
test("register: valid", async () => {
  const res = await request(app).post("/api/v1/auth/register").send(regBody());
  assert.equal(res.status, 201);
  assert.equal(res.body.success, true);
  assert.ok(res.body.data.accessToken);
  assert.ok(res.body.data.refreshToken);
  assert.ok(res.body.data.user.email);
  assert.ok(res.body.data.user.name);
  assert.equal(res.body.data.businessId, null);
  assert.equal(res.body.data.user.passwordHash, undefined);
});

test("register: does NOT create a default Business", async () => {
  const reg = await request(app).post("/api/v1/auth/register").send(regBody());
  assert.equal(reg.status, 201);
  const userId = reg.body.data.user.id;
  // No membership, no business — user must go through Business Setup explicitly.
  const memberships = await BusinessMembership.countDocuments({ userId });
  assert.equal(memberships, 0);
  const res = await request(app)
    .get("/api/v1/businesses")
    .set("Authorization", `Bearer ${reg.body.data.accessToken}`);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data, []);
});

test("register: duplicate email", async () => {
  const body = regBody();
  await request(app).post("/api/v1/auth/register").send(body);
  const res = await request(app)
    .post("/api/v1/auth/register")
    .send({ ...regBody(), email: body.email });
  assert.equal(res.status, 409);
});

test("register: invalid input", async () => {
  const res = await request(app)
    .post("/api/v1/auth/register")
    .send({ name: "", email: "bad", password: "1" });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, "VALIDATION_ERROR");
});

test("register: missing fields", async () => {
  const res = await request(app).post("/api/v1/auth/register").send({});
  assert.equal(res.status, 400);
});

// ── Login / Lockout ─────────────────────────────────────────
test("login: valid", async () => {
  const reg = await request(app).post("/api/v1/auth/register").send(regBody());
  const email = reg.body.data.user.email;
  const res = await request(app)
    .post("/api/v1/auth/login")
    .send({ email, password: "password123", ...DEV });
  assert.equal(res.status, 200);
  assert.ok(res.body.data.accessToken);
  assert.ok(res.body.data.refreshToken);
});

test("login: wrong password", async () => {
  const reg = await request(app).post("/api/v1/auth/register").send(regBody());
  const email = reg.body.data.user.email;
  const res = await request(app)
    .post("/api/v1/auth/login")
    .send({ email, password: "wrongpass", ...DEV });
  assert.equal(res.status, 401);
});

test("login: unknown user -> generic 401", async () => {
  const res = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: "nobody@example.com", password: "wrongpass", ...DEV });
  assert.equal(res.status, 401);
});

test("login: failed attempts increment then lockout", async () => {
  const reg = await request(app).post("/api/v1/auth/register").send(regBody());
  const email = reg.body.data.user.email;
  for (let i = 0; i < 4; i++) {
    await request(app)
      .post("/api/v1/auth/login")
      .send({ email, password: "wrongpass", ...{ ...DEV, deviceId: "dev-lock" } });
  }
  const beforeLock = await User.findOne({ email });
  assert.equal(beforeLock!.failedLoginAttempts, 4);
  const lock = await request(app)
    .post("/api/v1/auth/login")
    .send({ email, password: "wrongpass", ...{ ...DEV, deviceId: "dev-lock" } });
  assert.equal(lock.status, 401);
  const locked = await User.findOne({ email });
  assert.equal(locked!.status, "LOCKED");
  assert.ok(locked!.lockedUntil);
});

test("login: successful login resets attempts", async () => {
  const reg = await request(app).post("/api/v1/auth/register").send(regBody());
  const email = reg.body.data.user.email;
  await request(app).post("/api/v1/auth/login").send({ email, password: "wrongpass", ...DEV });
  await request(app).post("/api/v1/auth/login").send({ email, password: "password123", ...DEV });
  const user = await User.findOne({ email });
  assert.equal(user!.failedLoginAttempts, 0);
});

// ── Access token ────────────────────────────────────────────
test("access: valid token", async () => {
  const reg = await request(app).post("/api/v1/auth/register").send(regBody());
  const res = await request(app)
    .get("/api/v1/auth/me")
    .set("Authorization", `Bearer ${reg.body.data.accessToken}`);
  assert.equal(res.status, 200);
});

test("access: missing token", async () => {
  const res = await request(app).get("/api/v1/auth/me");
  assert.equal(res.status, 401);
});

test("access: invalid token", async () => {
  const res = await request(app).get("/api/v1/auth/me").set("Authorization", "Bearer not-a-jwt");
  assert.equal(res.status, 401);
});

test("access: expired token", async () => {
  const jwt = (await import("jsonwebtoken")).default;
  const env = (await import("../src/config/env")).env;
  const expired = jwt.sign(
    { userId: "x", deviceId: "d", sessionId: "s" },
    env.JWT_ACCESS_SECRET,
    { subject: "x", expiresIn: "-1s" }
  );
  const res = await request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${expired}`);
  assert.equal(res.status, 401);
});

// ── Refresh / Rotation / Reuse ──────────────────────────────
test("refresh: valid + rotation", async () => {
  const reg = await request(app).post("/api/v1/auth/register").send(regBody());
  const oldRefresh = reg.body.data.refreshToken;
  const res = await request(app)
    .post("/api/v1/auth/refresh")
    .send({ refreshToken: oldRefresh, deviceId: DEV.deviceId });
  assert.equal(res.status, 200);
  assert.ok(res.body.data.accessToken);
  assert.notEqual(res.body.data.refreshToken, oldRefresh);
  // old token now revoked
  const reuse = await request(app)
    .post("/api/v1/auth/refresh")
    .send({ refreshToken: oldRefresh, deviceId: DEV.deviceId });
  assert.equal(reuse.status, 401);
});

test("refresh: random token rejected", async () => {
  const res = await request(app)
    .post("/api/v1/auth/refresh")
    .send({ refreshToken: "random", deviceId: "d" });
  assert.equal(res.status, 401);
});

// ── Logout ──────────────────────────────────────────────────
test("logout revokes session; refresh after logout fails", async () => {
  const reg = await request(app).post("/api/v1/auth/register").send(regBody());
  const rt = reg.body.data.refreshToken;
  await request(app).post("/api/v1/auth/logout").send({ refreshToken: rt });
  const res = await request(app)
    .post("/api/v1/auth/refresh")
    .send({ refreshToken: rt, deviceId: DEV.deviceId });
  assert.equal(res.status, 401);
});

// ── Tenant isolation / RBAC ─────────────────────────────────
test("mandatory: cross-tenant isolation — User A cannot access Business B", async () => {
  const regA = await request(app).post("/api/v1/auth/register").send(regBody());
  const tokenA = regA.body.data.accessToken;

  // Second registration creates a distinct user (no default business)
  const regB = await request(app).post("/api/v1/auth/register").send(regBody());
  const tokenB = regB.body.data.accessToken;
  assert.equal(regA.body.data.businessId, null);
  assert.equal(regB.body.data.businessId, null);

  // Each user explicitly creates their own Business
  const bizARes = await request(app)
    .post("/api/v1/businesses")
    .set("Authorization", `Bearer ${tokenA}`)
    .send({ name: "Business A", type: "retail" });
  assert.equal(bizARes.status, 201);
  const businessA = bizARes.body.data.id;
  const userIdA = regA.body.data.user.id;

  const bizBRes = await request(app)
    .post("/api/v1/businesses")
    .set("Authorization", `Bearer ${tokenB}`)
    .send({ name: "Business B", type: "retail" });
  const businessB = bizBRes.body.data.id;
  assert.notEqual(businessA, businessB);

  // User A has NO membership in Business B
  const memB = await BusinessMembership.findOne({ userId: userIdA, businessId: businessB });
  assert.equal(memB, null);

  // User A is Owner of Business A only (membership auto-created server-side)
  const memA = await BusinessMembership.findOne({ userId: userIdA, businessId: businessA });
  assert.equal(memA!.role, "Owner");
});

test("RBAC: role resolved from membership only (Owner on explicit business creation)", async () => {
  const reg = await request(app).post("/api/v1/auth/register").send(regBody());
  const userId = reg.body.data.user.id;
  // No membership before a business is created
  const before = await BusinessMembership.findOne({ userId });
  assert.equal(before, null);

  const bizRes = await request(app)
    .post("/api/v1/businesses")
    .set("Authorization", `Bearer ${reg.body.data.accessToken}`)
    .send({ name: "My Shop", type: "retail" });
  assert.equal(bizRes.status, 201);

  const mem = await BusinessMembership.findOne({ userId });
  assert.ok(mem);
  assert.equal(mem!.role, "Owner");
  assert.equal(mem!.status, "ACTIVE");
});

test("me returns safe user + memberships", async () => {
  const reg = await request(app).post("/api/v1/auth/register").send(regBody());
  const token = reg.body.data.accessToken;
  // Fresh account has no memberships
  const empty = await request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${token}`);
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.body.data.memberships, []);

  // After explicit business creation the Owner membership shows up
  await request(app)
    .post("/api/v1/businesses")
    .set("Authorization", `Bearer ${token}`)
    .send({ name: "Owner Biz", type: "retail" });
  const res = await request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${token}`);
  assert.equal(res.status, 200);
  assert.ok(res.body.data.user.email);
  assert.equal(res.body.data.user.passwordHash, undefined);
  assert.ok(Array.isArray(res.body.data.memberships));
  assert.equal(res.body.data.memberships.length, 1);
  assert.equal(res.body.data.memberships[0].role, "Owner");
});