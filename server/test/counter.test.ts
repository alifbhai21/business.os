import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { connectTestDb, disconnectTestDb } from "./helpers/db";
import { app } from "../src/app";
import { BusinessCounter } from "../src/models/BusinessCounter";
import { nextSequence, COUNTER_KEYS } from "../src/services/counter.service";
import { withTransaction } from "../src/db/transactions";

const DEV = { deviceId: "counter-test-dev", deviceName: "CounterTest", platform: "android", appVersion: "1.0.0" };

function regBody(over: Record<string, unknown> = {}) {
  return {
    name: "Counter User",
    email: `cnt${Math.random().toString(36).slice(2)}@example.com`,
    phone: "019" + Math.floor(10000000 + Math.random() * 89999999),
    password: "password123",
    ...DEV,
    ...over,
  };
}

async function registerUser() {
  const res = await request(app).post("/api/v1/auth/register").send(regBody());
  assert.equal(res.status, 201);
  return res.body.data;
}

async function createBusiness(token: string, over: Record<string, unknown> = {}) {
  const res = await request(app)
    .post("/api/v1/businesses")
    .set("Authorization", `Bearer ${token}`)
    .send({ name: "Counter Business", type: "retail", ...over });
  assert.equal(res.status, 201);
  return res.body.data;
}

async function createShop(token: string, businessId: string) {
  const res = await request(app)
    .post("/api/v1/shops")
    .set("Authorization", `Bearer ${token}`)
    .send({ businessId, name: "Main", branchCode: `CNT-${Math.random().toString(36).slice(2)}` });
  assert.equal(res.status, 201);
  return res.body.data;
}

before(async () => {
  await connectTestDb("business-os-test-counter");
});

after(async () => {
  await disconnectTestDb();
});

test("counter: atomic incremental sequence via findOneAndUpdate (never countDocuments+1)", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  const shop = await createShop(user.accessToken, biz.id);

  // First increment creates the counter document via upsert (sequence 1)
  const first = await nextSequence(biz.id, shop.id, COUNTER_KEYS.SALE);
  const second = await nextSequence(biz.id, shop.id, COUNTER_KEYS.SALE);
  const third = await nextSequence(biz.id, shop.id, COUNTER_KEYS.SALE);

  assert.equal(first, 1);
  assert.equal(second, 2);
  assert.equal(third, 3);

  const doc = await BusinessCounter.findOne({
    businessId: new mongoose.Types.ObjectId(biz.id),
    shopId: new mongoose.Types.ObjectId(shop.id),
    key: COUNTER_KEYS.SALE,
  });
  assert.ok(doc);
  assert.equal(doc!.sequence, 3);
});

test("counter: separate key sequences are independent", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  const shop = await createShop(user.accessToken, biz.id);

  const sale1 = await nextSequence(biz.id, shop.id, COUNTER_KEYS.SALE);
  const sale2 = await nextSequence(biz.id, shop.id, COUNTER_KEYS.SALE);
  const purchase1 = await nextSequence(biz.id, shop.id, COUNTER_KEYS.PURCHASE);

  assert.equal(sale1, 1);
  assert.equal(sale2, 2);
  assert.equal(purchase1, 1); // independent sequence per key
});

test("counter: separate shops have independent sequences", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  const shop1 = await createShop(user.accessToken, biz.id);
  const shop2 = await createShop(user.accessToken, biz.id);

  const a1 = await nextSequence(biz.id, shop1.id, COUNTER_KEYS.SALE);
  const a2 = await nextSequence(biz.id, shop1.id, COUNTER_KEYS.SALE);
  const b1 = await nextSequence(biz.id, shop2.id, COUNTER_KEYS.SALE);

  assert.equal(a1, 1);
  assert.equal(a2, 2);
  assert.equal(b1, 1); // independent sequence per shop
});

test("counter: concurrent increments are unique and gap-free (no duplicates)", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  const shop = await createShop(user.accessToken, biz.id);

  const CONCURRENCY = 25;
  const results = await Promise.all(
    Array.from({ length: CONCURRENCY }, () => nextSequence(biz.id, shop.id, COUNTER_KEYS.PAYMENT))
  );

  // Every sequence must be unique (no duplicates)
  const unique = new Set(results);
  assert.equal(unique.size, CONCURRENCY);

  // Each increment is a distinct integer in [1..CONCURRENCY] — gap-free
  const sorted = [...results].sort((a, b) => a - b);
  for (let i = 0; i < CONCURRENCY; i++) {
    assert.equal(sorted[i], i + 1);
  }
});

test("counter: concurrent increments inside transactions stay unique", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  const shop = await createShop(user.accessToken, biz.id);

  const CONCURRENCY = 10;
  const results = await Promise.all(
    Array.from({ length: CONCURRENCY }, () =>
      withTransaction(async (session) => nextSequence(biz.id, shop.id, COUNTER_KEYS.EXPENSE, session))
    )
  );

  const unique = new Set(results);
  assert.equal(unique.size, CONCURRENCY);
  const sorted = [...results].sort((a, b) => a - b);
  for (let i = 0; i < CONCURRENCY; i++) {
    assert.equal(sorted[i], i + 1);
  }
});