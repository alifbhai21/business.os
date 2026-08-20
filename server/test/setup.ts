import { before, after } from "node:test";
import { app } from "../src/app";
import { connectTestDb, disconnectTestDb } from "./helpers/db";

export async function setupTestServer() {
  before(async () => {
    await connectTestDb("business-os-test");
  });

  after(async () => {
    await disconnectTestDb();
  });

  return app;
}