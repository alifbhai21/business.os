import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { app } from "../src/app";
import { Product } from "../src/models/Product";
import { BusinessMembership } from "../src/models/BusinessMembership";
import { connectTestDb, disconnectTestDb } from "./helpers/db";

const DEV = { deviceId: "prod-test-dev", deviceName: "ProdTest", platform: "android", appVersion: "1.0.0" };

function regBody(over: Record<string, unknown> = {}) {
  return {
    name: "Product User",
    email: `prod${Math.random().toString(36).slice(2)}@example.com`,
    phone: "017" + Math.floor(10000000 + Math.random() * 89999999),
    password: "password123",
    ...DEV,
    ...over,
  };
}

async function registerUser() {
  const res = await request(app).post("/api/v1/auth/register").send(regBody());
  return res.body.data;
}

async function createBusiness(token: string, over: Record<string, unknown> = {}) {
  const res = await request(app)
    .post("/api/v1/businesses")
    .set("Authorization", `Bearer ${token}`)
    .send({ name: "Product Business", type: "retail", ...over });
  return res.body.data;
}

async function createCategory(token: string, businessId: string, name: string) {
  const res = await request(app)
    .post("/api/v1/categories")
    .set("Authorization", `Bearer ${token}`)
    .send({ businessId, name });
  return res.body.data;
}

async function createSupplier(token: string, businessId: string, name: string) {
  const res = await request(app)
    .post("/api/v1/suppliers")
    .set("Authorization", `Bearer ${token}`)
    .send({ businessId, name });
  return res.body.data;
}

function productBody(over: Record<string, unknown> = {}) {
  return {
    name: "Test Product",
    sku: "SKU-1",
    barcode: "8901234567890",
    brand: "BrandX",
    unit: "piece",
    purchasePrice: 5000,
    sellingPrice: 6500,
    wholesalePrice: 6000,
    minPrice: 5500,
    taxRate: 5,
    currentStock: 10,
    minStock: 2,
    maxStock: 50,
    ...over,
  };
}

async function createProduct(token: string, businessId: string, over: Record<string, unknown> = {}) {
  const res = await request(app)
    .post("/api/v1/products")
    .set("Authorization", `Bearer ${token}`)
    .send({ businessId, ...productBody(over) });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data;
}

async function setMembershipRole(userId: string, businessId: string, role: string) {
  await BusinessMembership.findOneAndUpdate(
    { userId: new mongoose.Types.ObjectId(userId), businessId: new mongoose.Types.ObjectId(businessId) },
    { role }
  );
}

before(async () => {
  await connectTestDb("business-os-test-prod");
});

after(async () => {
  await disconnectTestDb();
});

test("product: owner can create a Product with all PRD fields", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  const res = await request(app)
    .post("/api/v1/products")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({ businessId: biz.id, ...productBody() });
  assert.equal(res.status, 201);
  assert.equal(res.body.data.name, "Test Product");
  assert.equal(res.body.data.sku, "SKU-1");
  assert.equal(res.body.data.barcode, "8901234567890");
  assert.equal(res.body.data.brand, "BrandX");
  assert.equal(res.body.data.unit, "piece");
  assert.equal(res.body.data.purchasePrice, 5000);
  assert.equal(res.body.data.sellingPrice, 6500);
  assert.equal(res.body.data.wholesalePrice, 6000);
  assert.equal(res.body.data.minPrice, 5500);
  assert.equal(res.body.data.taxRate, 5);
  assert.equal(res.body.data.currentStock, 10);
  assert.equal(res.body.data.minStock, 2);
  assert.equal(res.body.data.maxStock, 50);
  assert.equal(res.body.data.avgCost, 5000); // seeded from purchase price
  assert.equal(res.body.data.status, "ACTIVE");
});

test("product: create validates required fields and prices", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  const noName = await request(app)
    .post("/api/v1/products")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({ businessId: biz.id, name: "" });
  assert.equal(noName.status, 400);
  assert.equal(noName.body.error.code, "VALIDATION_ERROR");

  const negativePrice = await request(app)
    .post("/api/v1/products")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({ businessId: biz.id, name: "X", sellingPrice: -5 });
  assert.equal(negativePrice.status, 400);
});

test("product: duplicate barcode within same Business rejected (409)", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  await createProduct(user.accessToken, biz.id);
  const dup = await request(app)
    .post("/api/v1/products")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({ businessId: biz.id, ...productBody({ name: "Duplicate Barcode" }) });
  assert.equal(dup.status, 409);
  assert.match(dup.body.error.message, /barcode already exists/i);
});

test("product: same barcode in different Businesses allowed", async () => {
  const userA = await registerUser();
  const userB = await registerUser();
  const bizA = await createBusiness(userA.accessToken);
  const bizB = await createBusiness(userB.accessToken);
  const a = await createProduct(userA.accessToken, bizA.id);
  const b = await createProduct(userB.accessToken, bizB.id);
  assert.ok(a.id);
  assert.ok(b.id);
});

test("product: product can reference category and preferred supplier of same Business", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  const cat = await createCategory(user.accessToken, biz.id, "Drinks");
  const sup = await createSupplier(user.accessToken, biz.id, "Acme Supplies");
  const res = await request(app)
    .post("/api/v1/products")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({ businessId: biz.id, ...productBody({ categoryId: cat.id, preferredSupplierId: sup.id }) });
  assert.equal(res.status, 201);
  assert.equal(res.body.data.categoryId, cat.id);
  assert.equal(res.body.data.preferredSupplierId, sup.id);
});

test("product: category from another Business rejected", async () => {
  const userA = await registerUser();
  const userB = await registerUser();
  const bizA = await createBusiness(userA.accessToken);
  const bizB = await createBusiness(userB.accessToken);
  const catB = await createCategory(userB.accessToken, bizB.id, "Foreign");
  const res = await request(app)
    .post("/api/v1/products")
    .set("Authorization", `Bearer ${userA.accessToken}`)
    .send({ businessId: bizA.id, ...productBody({ categoryId: catB.id }) });
  assert.equal(res.status, 400);
  assert.match(res.body.error.message, /categoryId/i);
});

test("product: list is paginated with search by name/sku/barcode", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  await createProduct(user.accessToken, biz.id, { name: "Coca Cola", sku: "CC-01", barcode: "1111111111111" });
  await createProduct(user.accessToken, biz.id, { name: "Pepsi", sku: "PP-01", barcode: "2222222222222" });
  await createProduct(user.accessToken, biz.id, { name: "Water", sku: "WT-01", barcode: "3333333333333" });

  const byName = await request(app)
    .get(`/api/v1/products?businessId=${biz.id}&search=cola`)
    .set("Authorization", `Bearer ${user.accessToken}`);
  assert.equal(byName.status, 200);
  assert.equal(byName.body.data.items.length, 1);
  assert.equal(byName.body.data.items[0].name, "Coca Cola");

  const bySku = await request(app)
    .get(`/api/v1/products?businessId=${biz.id}&search=PP-01`)
    .set("Authorization", `Bearer ${user.accessToken}`);
  assert.equal(bySku.body.data.items.length, 1);
  assert.equal(bySku.body.data.items[0].name, "Pepsi");

  const byBarcode = await request(app)
    .get(`/api/v1/products?businessId=${biz.id}&search=2222222222222`)
    .set("Authorization", `Bearer ${user.accessToken}`);
  assert.equal(byBarcode.body.data.items.length, 1);

  const page = await request(app)
    .get(`/api/v1/products?businessId=${biz.id}&page=1&limit=2`)
    .set("Authorization", `Bearer ${user.accessToken}`);
  assert.equal(page.body.data.items.length, 2);
  assert.equal(page.body.data.pagination.total, 3);
  assert.equal(page.body.data.pagination.totalPages, 2);
});

test("product: low-stock filter works", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  await createProduct(user.accessToken, biz.id, { name: "Low One", currentStock: 1, minStock: 5, barcode: "4444444444444" });
  await createProduct(user.accessToken, biz.id, { name: "Healthy", currentStock: 10, minStock: 5, barcode: "5555555555555" });
  const res = await request(app)
    .get(`/api/v1/products?businessId=${biz.id}&lowStock=true`)
    .set("Authorization", `Bearer ${user.accessToken}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.items.length, 1);
  assert.equal(res.body.data.items[0].name, "Low One");
});

test("product: category filter works", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  const cat = await createCategory(user.accessToken, biz.id, "Filtered");
  await createProduct(user.accessToken, biz.id, { name: "In Cat", categoryId: cat.id, barcode: "6666666666666" });
  await createProduct(user.accessToken, biz.id, { name: "Not In Cat", barcode: "7777777777777" });
  const res = await request(app)
    .get(`/api/v1/products?businessId=${biz.id}&categoryId=${cat.id}`)
    .set("Authorization", `Bearer ${user.accessToken}`);
  assert.equal(res.body.data.items.length, 1);
  assert.equal(res.body.data.items[0].name, "In Cat");
});

test("product: owner can get own Product by id", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  const prod = await createProduct(user.accessToken, biz.id);
  const res = await request(app)
    .get(`/api/v1/products/${prod.id}?businessId=${biz.id}`)
    .set("Authorization", `Bearer ${user.accessToken}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.id, prod.id);
});

test("product: barcode lookup endpoint finds exact product", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  await createProduct(user.accessToken, biz.id, { barcode: "8801946000001" });
  const hit = await request(app)
    .get(`/api/v1/products/lookup/barcode?businessId=${biz.id}&barcode=8801946000001`)
    .set("Authorization", `Bearer ${user.accessToken}`);
  assert.equal(hit.status, 200);
  assert.equal(hit.body.data.barcode, "8801946000001");

  const miss = await request(app)
    .get(`/api/v1/products/lookup/barcode?businessId=${biz.id}&barcode=9999999999999`)
    .set("Authorization", `Bearer ${user.accessToken}`);
  assert.equal(miss.status, 404);
});

test("product: owner can update own Product", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  const prod = await createProduct(user.accessToken, biz.id);
  const res = await request(app)
    .put(`/api/v1/products/${prod.id}`)
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({ businessId: biz.id, name: "Renamed", sellingPrice: 7000, minStock: 3 });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.name, "Renamed");
  assert.equal(res.body.data.sellingPrice, 7000);
  assert.equal(res.body.data.minStock, 3);
  assert.equal(res.body.data.purchasePrice, 5000); // untouched
});

test("product: update to an existing barcode rejected (409)", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  await createProduct(user.accessToken, biz.id, { name: "First", barcode: "1212121212121" });
  const second = await createProduct(user.accessToken, biz.id, { name: "Second", barcode: "2323232323232" });
  const res = await request(app)
    .patch(`/api/v1/products/${second.id}`)
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({ businessId: biz.id, barcode: "1212121212121" });
  assert.equal(res.status, 409);
});

test("product: owner can activate/deactivate Product (soft-delete)", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  const prod = await createProduct(user.accessToken, biz.id);
  const res = await request(app)
    .patch(`/api/v1/products/${prod.id}/status`)
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({ businessId: biz.id, status: "INACTIVE" });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.status, "INACTIVE");
  const list = await request(app)
    .get(`/api/v1/products?businessId=${biz.id}`)
    .set("Authorization", `Bearer ${user.accessToken}`);
  assert.equal(list.body.data.items.length, 0);
  // Detail still returns the record (any status).
  const detail = await request(app)
    .get(`/api/v1/products/${prod.id}?businessId=${biz.id}`)
    .set("Authorization", `Bearer ${user.accessToken}`);
  assert.equal(detail.status, 200);
});

test("product: Viewer role cannot create/update (403)", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  await setMembershipRole(user.user.id, biz.id, "Viewer");
  const create = await request(app)
    .post("/api/v1/products")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({ businessId: biz.id, ...productBody() });
  assert.equal(create.status, 403);
  const list = await request(app)
    .get(`/api/v1/products?businessId=${biz.id}`)
    .set("Authorization", `Bearer ${user.accessToken}`);
  assert.equal(list.status, 200);
});

test("product: cross-tenant isolation — Business A never sees B's products", async () => {
  const userA = await registerUser();
  const userB = await registerUser();
  const bizA = await createBusiness(userA.accessToken);
  const bizB = await createBusiness(userB.accessToken);
  const prodA = await createProduct(userA.accessToken, bizA.id, { barcode: "8888888888888" });

  const deniedList = await request(app)
    .get(`/api/v1/products?businessId=${bizA.id}`)
    .set("Authorization", `Bearer ${userB.accessToken}`);
  assert.equal(deniedList.status, 404);

  const deniedGet = await request(app)
    .get(`/api/v1/products/${prodA.id}?businessId=${bizA.id}`)
    .set("Authorization", `Bearer ${userB.accessToken}`);
  assert.equal(deniedGet.status, 404);

  const deniedCreate = await request(app)
    .post("/api/v1/products")
    .set("Authorization", `Bearer ${userB.accessToken}`)
    .send({ businessId: bizA.id, ...productBody({ barcode: "9999999999999" }) });
  assert.equal(deniedCreate.status, 404);

  const deniedBarcode = await request(app)
    .get(`/api/v1/products/lookup/barcode?businessId=${bizA.id}&barcode=8888888888888`)
    .set("Authorization", `Bearer ${userB.accessToken}`);
  assert.equal(deniedBarcode.status, 404);

  // A's product is still there and untouched.
  const count = await Product.countDocuments({ businessId: new mongoose.Types.ObjectId(bizA.id) });
  assert.equal(count, 1);
});

test("product: unauthenticated user denied", async () => {
  const res = await request(app).get("/api/v1/products?businessId=abc");
  assert.equal(res.status, 401);
});

test("units: authenticated user can list global predefined units", async () => {
  const user = await registerUser();
  const res = await request(app)
    .get("/api/v1/units")
    .set("Authorization", `Bearer ${user.accessToken}`);
  assert.equal(res.status, 200);
  const values = res.body.data.map((u: { value: string }) => u.value);
  assert.ok(values.includes("piece"));
  assert.ok(values.includes("kg"));
  assert.ok(values.includes("custom"));
  assert.equal(values.length, 10);
});