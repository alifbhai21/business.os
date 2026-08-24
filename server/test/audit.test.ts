import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { connectTestDb, disconnectTestDb } from "./helpers/db";
import { app } from "../src/app";

const DEV = { deviceId: "audit-test-dev", deviceName: "AuditTest", platform: "android", appVersion: "1.0.0" };

function regBody(over: Record<string, unknown> = {}) {
  return {
    name: "Audit Test User",
    email: `aud${Math.random().toString(36).slice(2)}@example.com`,
    phone: "017" + Math.floor(10000000 + Math.random() * 89999999),
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
    .send({ name: "Audit Business", type: "retail" });
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
  await connectTestDb("business-os-test-audit");
});

after(async () => {
  await disconnectTestDb();
});

test("audit: owner sees audit rows for actions performed through the API (real writes)", async () => {
  const owner = await registerUser();
  const biz = await createBusiness(owner.accessToken);

  // Generate auditable activity through real endpoints.
  const staff = await registerUser();
  const created = await addEmployee(owner.accessToken, biz.id, staff.phone, "Salesperson");
  assert.equal(created.status, 201);

  const res = await request(app)
    .get(`/api/v1/audit?businessId=${biz.id}`)
    .set("Authorization", `Bearer ${owner.accessToken}`);
  assert.equal(res.status, 200);

  const actions = res.body.data.data.map((e: { action: string }) => e.action);
  // Business creation + employee creation both write audit rows.
  assert.ok(actions.includes("BUSINESS_CREATED"), `expected BUSINESS_CREATED in ${JSON.stringify(actions)}`);
  assert.ok(actions.includes("EMPLOYEE_CREATED"), `expected EMPLOYEE_CREATED in ${JSON.stringify(actions)}`);

  const employeeRow = res.body.data.data.find((e: { action: string }) => e.action === "EMPLOYEE_CREATED");
  assert.ok(employeeRow.recordId, "recordId populated");
  assert.ok(employeeRow.details.includes(staff.phone), "details include the invited phone");
});

test("audit: action filter returns only matching rows", async () => {
  const owner = await registerUser();
  const biz = await createBusiness(owner.accessToken);
  // An unknown phone stays INVITED — the service distinguishes
  // EMPLOYEE_INVITED (no linked account) from EMPLOYEE_CREATED.
  await addEmployee(owner.accessToken, biz.id, "01655443322", "Viewer");

  const res = await request(app)
    .get(`/api/v1/audit?businessId=${biz.id}&action=EMPLOYEE_INVITED`)
    .set("Authorization", `Bearer ${owner.accessToken}`);
  assert.equal(res.status, 200);
  assert.ok(res.body.data.pagination.total >= 1);
  for (const row of res.body.data.data) {
    assert.equal(row.action, "EMPLOYEE_INVITED");
  }
});

test("audit: pagination works (limit/page/totalPages)", async () => {
  const owner = await registerUser();
  const biz = await createBusiness(owner.accessToken);
  for (let i = 0; i < 3; i++) {
    await addEmployee(owner.accessToken, biz.id, `0159988776${i}`, "Viewer");
  }

  const page1 = await request(app)
    .get(`/api/v1/audit?businessId=${biz.id}&action=EMPLOYEE_INVITED&limit=2&page=1`)
    .set("Authorization", `Bearer ${owner.accessToken}`);
  assert.equal(page1.status, 200);
  assert.equal(page1.body.data.data.length, 2);
  assert.equal(page1.body.data.pagination.total, 3);
  assert.equal(page1.body.data.pagination.totalPages, 2);

  const page2 = await request(app)
    .get(`/api/v1/audit?businessId=${biz.id}&action=EMPLOYEE_INVITED&limit=2&page=2`)
    .set("Authorization", `Bearer ${owner.accessToken}`);
  assert.equal(page2.status, 200);
  assert.equal(page2.body.data.data.length, 1);
});

test("audit: RBAC — Accountant may read; Salesperson/Inventory Manager/Viewer are 403", async () => {
  const owner = await registerUser();
  const biz = await createBusiness(owner.accessToken);

  const accountant = await registerUser();
  const salesperson = await registerUser();
  const inventoryMgr = await registerUser();
  const viewer = await registerUser();
  assert.equal((await addEmployee(owner.accessToken, biz.id, accountant.phone, "Accountant")).status, 201);
  assert.equal((await addEmployee(owner.accessToken, biz.id, salesperson.phone, "Salesperson")).status, 201);
  assert.equal((await addEmployee(owner.accessToken, biz.id, inventoryMgr.phone, "Inventory Manager")).status, 201);
  assert.equal((await addEmployee(owner.accessToken, biz.id, viewer.phone, "Viewer")).status, 201);

  const ok = await request(app)
    .get(`/api/v1/audit?businessId=${biz.id}`)
    .set("Authorization", `Bearer ${accountant.accessToken}`);
  assert.equal(ok.status, 200);

  for (const token of [salesperson.accessToken, inventoryMgr.accessToken, viewer.accessToken]) {
    const denied = await request(app)
      .get(`/api/v1/audit?businessId=${biz.id}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(denied.status, 403);
  }
});

test("audit: tenant isolation — another business's owner cannot read our audit trail", async () => {
  const ownerA = await registerUser();
  const ownerB = await registerUser();
  const bizA = await createBusiness(ownerA.accessToken);
  await createBusiness(ownerB.accessToken);

  const foreign = await request(app)
    .get(`/api/v1/audit?businessId=${bizA.id}`)
    .set("Authorization", `Bearer ${ownerB.accessToken}`);
  assert.equal(foreign.status, 404);
});

test("audit: invalid date filters are rejected with 400; empty result is a clean empty list", async () => {
  const owner = await registerUser();
  const biz = await createBusiness(owner.accessToken);

  const badDate = await request(app)
    .get(`/api/v1/audit?businessId=${biz.id}&from=not-a-date`)
    .set("Authorization", `Bearer ${owner.accessToken}`);
  assert.equal(badDate.status, 400);

  const empty = await request(app)
    .get(`/api/v1/audit?businessId=${biz.id}&action=NO_SUCH_ACTION`)
    .set("Authorization", `Bearer ${owner.accessToken}`);
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.body.data.data, []);
  assert.equal(empty.body.data.pagination.total, 0);
});

test("audit: unauthenticated requests are 401", async () => {
  const res = await request(app).get("/api/v1/audit?businessId=abc");
  assert.equal(res.status, 401);
});