import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { connectTestDb, disconnectTestDb } from "./helpers/db";
import { app } from "../src/app";
import { RefreshToken } from "../src/models/RefreshToken";

const DEV = { deviceId: "dev-test-dev", deviceName: "DevTest", platform: "android", appVersion: "1.0.0" };

function regBody(over: Record<string, unknown> = {}) {
  return {
    name: "Device Test User",
    email: `dev${Math.random().toString(36).slice(2)}@example.com`,
    phone: "019" + Math.floor(10000000 + Math.random() * 89999999),
    password: "password123",
    ...DEV,
    ...over,
  };
}

async function registerUser(over: Record<string, unknown> = {}) {
  const res = await request(app).post("/api/v1/auth/register").send(regBody(over));
  assert.equal(res.status, 201);
  // Flatten { user, businessId, accessToken, refreshToken, sessionId } so
  // helpers can use .accessToken / .phone / .id directly. The register
  // response nests profile fields under `user` (verified Phase 02 contract).
  return { ...res.body.data.user, ...res.body.data };
}

async function createBusiness(token: string) {
  const res = await request(app)
    .post("/api/v1/businesses")
    .set("Authorization", `Bearer ${token}`)
    .send({ name: "Device Business", type: "retail" });
  assert.equal(res.status, 201);
  return res.body.data;
}

async function addEmployee(
  ownerToken: string,
  businessId: string,
  phone: string,
  role: string
) {
  return request(app)
    .post("/api/v1/employees")
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ businessId, name: "Staff", phone, role });
}

before(async () => {
  await connectTestDb("business-os-test-dev");
});

after(async () => {
  await disconnectTestDb();
});

test("device: member registers their own device → 201 with server-set userId", async () => {
  const owner = await registerUser();
  const biz = await createBusiness(owner.accessToken);

  const res = await request(app)
    .post("/api/v1/devices")
    .set("Authorization", `Bearer ${owner.accessToken}`)
    .send({ businessId: biz.id, deviceId: "phone-abc-001", deviceName: "Galaxy A54" });
  assert.equal(res.status, 201);
  assert.equal(res.body.data.deviceId, "phone-abc-001");
  assert.equal(res.body.data.userId, owner.id);
  assert.equal(res.body.data.status, "ACTIVE");
  assert.equal(res.body.data.businessId, biz.id);
});

test("device: re-registering the same device is idempotent (200 duplicate:true)", async () => {
  const owner = await registerUser();
  const biz = await createBusiness(owner.accessToken);
  const body = { businessId: biz.id, deviceId: "phone-dup-002" };
  const first = await request(app)
    .post("/api/v1/devices")
    .set("Authorization", `Bearer ${owner.accessToken}`)
    .send(body);
  assert.equal(first.status, 201);
  const second = await request(app)
    .post("/api/v1/devices")
    .set("Authorization", `Bearer ${owner.accessToken}`)
    .send(body);
  assert.equal(second.status, 200);
  assert.equal(second.body.data.duplicate, true);
});

test("device: list requires Owner/Admin/Manager; Salesperson/Accountant are 403", async () => {
  const owner = await registerUser();
  const biz = await createBusiness(owner.accessToken);

  const salesperson = await registerUser();
  const accountant = await registerUser();
  assert.equal((await addEmployee(owner.accessToken, biz.id, salesperson.phone, "Salesperson")).status, 201);
  assert.equal((await addEmployee(owner.accessToken, biz.id, accountant.phone, "Accountant")).status, 201);

  // Register a device so the list has content.
  await request(app)
    .post("/api/v1/devices")
    .set("Authorization", `Bearer ${owner.accessToken}`)
    .send({ businessId: biz.id, deviceId: "phone-list-003" });

  const ok = await request(app)
    .get(`/api/v1/devices?businessId=${biz.id}`)
    .set("Authorization", `Bearer ${owner.accessToken}`);
  assert.equal(ok.status, 200);
  assert.ok(ok.body.data.pagination.total >= 1);
  assert.ok(ok.body.data.data[0].userPhone, "userPhone join expected");

  for (const token of [salesperson.accessToken, accountant.accessToken]) {
    const denied = await request(app)
      .get(`/api/v1/devices?businessId=${biz.id}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(denied.status, 403);
  }
});

test("device: revoke sets REVOKED and terminates the device's refresh tokens (real session kill)", async () => {
  const owner = await registerUser();
  const staff = await registerUser({ deviceId: "staff-phone-004" });
  const biz = await createBusiness(owner.accessToken);
  assert.equal((await addEmployee(owner.accessToken, biz.id, staff.phone, "Manager")).status, 201);

  // Staff's auth registration already created this Device row; the API call
  // links it into the business — idempotent re-register → 200 duplicate:true.
  const reg = await request(app)
    .post("/api/v1/devices")
    .set("Authorization", `Bearer ${staff.accessToken}`)
    .send({ businessId: biz.id, deviceId: "staff-phone-004" });
  assert.equal(reg.status, 200);
  assert.equal(reg.body.data.duplicate, true);
  assert.equal(reg.body.data.businessId, biz.id);
  const deviceDocId = reg.body.data.id;

  // Signup issued exactly one live refresh token against this device.
  const liveTokensBefore = await RefreshToken.countDocuments({
    deviceId: deviceDocId,
    revokedAt: null,
  });
  assert.ok(liveTokensBefore >= 1, "signup refresh token expected on this device");

  const revoke = await request(app)
    .put(`/api/v1/devices/${deviceDocId}/revoke`)
    .set("Authorization", `Bearer ${owner.accessToken}`)
    .send({ businessId: biz.id });
  assert.equal(revoke.status, 200);
  assert.equal(revoke.body.data.status, "REVOKED");

  const revokedCount = await RefreshToken.countDocuments({
    deviceId: deviceDocId,
    revokedAt: { $ne: null },
  });
  assert.equal(revokedCount, liveTokensBefore, "all previously-live tokens must be revoked");

  // Re-revoke is idempotent.
  const again = await request(app)
    .put(`/api/v1/devices/${deviceDocId}/revoke`)
    .set("Authorization", `Bearer ${owner.accessToken}`)
    .send({ businessId: biz.id });
  assert.equal(again.status, 200);
  assert.equal(again.body.data.duplicate, true);
});

test("device: sync heartbeat only by the device owner; others are 403", async () => {
  const owner = await registerUser();
  const staff = await registerUser();
  const other = await registerUser();
  const biz = await createBusiness(owner.accessToken);
  assert.equal((await addEmployee(owner.accessToken, biz.id, staff.phone, "Viewer")).status, 201);
  assert.equal((await addEmployee(owner.accessToken, biz.id, other.phone, "Viewer")).status, 201);

  const reg = await request(app)
    .post("/api/v1/devices")
    .set("Authorization", `Bearer ${staff.accessToken}`)
    .send({ businessId: biz.id, deviceId: "staff-sync-005" });
  const deviceDocId = reg.body.data.id;

  const foreign = await request(app)
    .put(`/api/v1/devices/${deviceDocId}/sync`)
    .set("Authorization", `Bearer ${other.accessToken}`)
    .send({ businessId: biz.id });
  assert.equal(foreign.status, 403);

  const own = await request(app)
    .put(`/api/v1/devices/${deviceDocId}/sync`)
    .set("Authorization", `Bearer ${staff.accessToken}`)
    .send({ businessId: biz.id });
  assert.equal(own.status, 200);
  assert.ok(own.body.data.lastSyncAt, "lastSyncAt set");
});

test("device: cross-tenant revoke/list are 404/403 with zero side effects", async () => {
  const ownerA = await registerUser();
  const ownerB = await registerUser();
  const bizA = await createBusiness(ownerA.accessToken);
  const bizB = await createBusiness(ownerB.accessToken);

  const reg = await request(app)
    .post("/api/v1/devices")
    .set("Authorization", `Bearer ${ownerA.accessToken}`)
    .send({ businessId: bizA.id, deviceId: "tenant-iso-006" });
  const deviceDocId = reg.body.data.id;

  const foreignRevoke = await request(app)
    .put(`/api/v1/devices/${deviceDocId}/revoke`)
    .set("Authorization", `Bearer ${ownerB.accessToken}`)
    .send({ businessId: bizB.id });
  assert.equal(foreignRevoke.status, 404);

  const foreignList = await request(app)
    .get(`/api/v1/devices?businessId=${bizA.id}`)
    .set("Authorization", `Bearer ${ownerB.accessToken}`);
  assert.equal(foreignList.status, 404);

  const stillActive = await request(app)
    .get(`/api/v1/devices?businessId=${bizA.id}&status=ACTIVE`)
    .set("Authorization", `Bearer ${ownerA.accessToken}`);
  assert.equal(stillActive.status, 200);
  assert.ok(stillActive.body.data.pagination.total >= 1);
});

test("device: unauthenticated requests are 401; strict schema rejects spoofed fields", async () => {
  const res = await request(app).get("/api/v1/devices?businessId=abc");
  assert.equal(res.status, 401);

  const owner = await registerUser();
  const biz = await createBusiness(owner.accessToken);
  const spoof = await request(app)
    .post("/api/v1/devices")
    .set("Authorization", `Bearer ${owner.accessToken}`)
    .send({ businessId: biz.id, deviceId: "spoof-007", userId: "507f1f77bcf86cd799439011" });
  assert.equal(spoof.status, 400);
});