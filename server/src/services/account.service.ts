import { Types, ClientSession } from "mongoose";
import { Account, AccountDocument } from "../models/Account";
import { AccountType, DEFAULT_CASH_ACCOUNT_NAME } from "../config/accounts";
import { membershipFor, isDuplicateKeyError } from "./membership";
import { ApiError } from "../utils/ApiError";
import { assertSafePaisa } from "../utils/money";

export interface CreateAccountInput {
  businessId: string;
  shopId: string;
  name: string;
  type: AccountType;
  accountNumber?: string | null;
}

export interface UpdateAccountInput {
  name?: string;
  accountNumber?: string | null;
  type?: AccountType;
}

function toPublic(account: AccountDocument) {
  return {
    id: String(account._id),
    businessId: String(account.businessId),
    shopId: String(account.shopId),
    name: account.name,
    type: account.type,
    accountNumber: account.accountNumber,
    currentBalance: account.currentBalance,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}

async function assertAccess(userId: string, businessId: string, shopId: string) {
  const membership = await membershipFor(userId, businessId);
  if (!membership) throw ApiError.notFound("Business not found");
  if (membership.shopId && String(membership.shopId) !== shopId) {
    throw ApiError.notFound("Shop not found");
  }
  return membership;
}

async function assertCanManage(userId: string, businessId: string, shopId: string) {
  const membership = await assertAccess(userId, businessId, shopId);
  if (membership.role !== "Owner" && membership.role !== "Admin" && membership.role !== "Accountant") {
    throw ApiError.forbidden("Only Owner/Admin/Accountant can manage accounts");
  }
  return membership;
}

export async function createAccount(userId: string, input: CreateAccountInput) {
  await assertCanManage(userId, input.businessId, input.shopId);
  try {
    const account = await Account.create({
      businessId: new Types.ObjectId(input.businessId),
      shopId: new Types.ObjectId(input.shopId),
      name: input.name,
      type: input.type,
      accountNumber: input.accountNumber ?? null,
      currentBalance: 0, // never client-supplied; seeded by financial services
    });
    return toPublic(account);
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      throw ApiError.conflict("An account with this name already exists in this shop");
    }
    throw err;
  }
}

export async function listAccounts(userId: string, businessId: string, shopId?: string | null) {
  let effectiveShopId: string | null = shopId ?? null;
  if (shopId) {
    await assertAccess(userId, businessId, shopId);
  } else {
    const membership = await membershipFor(userId, businessId);
    if (!membership) throw ApiError.notFound("Business not found");
    // Shop-scoped members may only list their own shop's accounts.
    if (membership.shopId) effectiveShopId = String(membership.shopId);
  }
  const filter: Record<string, unknown> = { businessId: new Types.ObjectId(businessId) };
  if (effectiveShopId) filter.shopId = new Types.ObjectId(effectiveShopId);
  const accounts = await Account.find(filter).sort({ type: 1, name: 1 });
  return accounts.map(toPublic);
}

export async function getAccount(userId: string, businessId: string, shopId: string, accountId: string) {
  await assertAccess(userId, businessId, shopId);
  const account = await Account.findOne({
    _id: new Types.ObjectId(accountId),
    businessId: new Types.ObjectId(businessId),
    shopId: new Types.ObjectId(shopId),
  });
  if (!account) throw ApiError.notFound("Account not found");
  return toPublic(account);
}

export async function updateAccount(
  userId: string,
  businessId: string,
  shopId: string,
  accountId: string,
  input: UpdateAccountInput
) {
  await assertCanManage(userId, businessId, shopId);
  const account = await Account.findOne({
    _id: new Types.ObjectId(accountId),
    businessId: new Types.ObjectId(businessId),
    shopId: new Types.ObjectId(shopId),
  });
  if (!account) throw ApiError.notFound("Account not found");
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.accountNumber !== undefined) patch.accountNumber = input.accountNumber;
  if (input.type !== undefined) patch.type = input.type;
  // currentBalance is NEVER updated here — balances change only via
  // incrementBalance/decrementBalance from financial services.
  Object.assign(account, patch);
  try {
    await account.save();
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      throw ApiError.conflict("An account with this name already exists in this shop");
    }
    throw err;
  }
  return toPublic(account);
}

/**
 * Internal balance mutation — credit (increase) an account balance by a
 * validated integer-paisa amount. MUST be called inside a MongoDB
 * transaction (pass the transaction session) by financial services.
 */
export async function incrementBalance(
  businessId: string,
  shopId: string,
  accountId: string,
  amountPaisa: number,
  session?: ClientSession | null
) {
  assertSafePaisa(amountPaisa, "amount");
  if (amountPaisa <= 0) throw ApiError.badRequest("Increment amount must be positive paisa");
  const res = await Account.updateOne(
    { _id: new Types.ObjectId(accountId), businessId: new Types.ObjectId(businessId), shopId: new Types.ObjectId(shopId) },
    { $inc: { currentBalance: amountPaisa } },
    { session: session ?? undefined }
  );
  if (res.modifiedCount === 0) throw ApiError.notFound("Account not found");
}

/**
 * Internal balance mutation — debit (decrease) an account balance with an
 * atomic balance guard (never goes negative). MUST be called inside a
 * MongoDB transaction by financial services.
 */
export async function decrementBalance(
  businessId: string,
  shopId: string,
  accountId: string,
  amountPaisa: number,
  session?: ClientSession | null
) {
  assertSafePaisa(amountPaisa, "amount");
  if (amountPaisa <= 0) throw ApiError.badRequest("Decrement amount must be positive paisa");
  const res = await Account.updateOne(
    {
      _id: new Types.ObjectId(accountId),
      businessId: new Types.ObjectId(businessId),
      shopId: new Types.ObjectId(shopId),
      currentBalance: { $gte: amountPaisa },
    },
    { $inc: { currentBalance: -amountPaisa } },
    { session: session ?? undefined }
  );
  if (res.modifiedCount === 0) {
    throw ApiError.badRequest("Insufficient account balance");
  }
}

/** Lookup the default cash account seeded at shop creation. */
export async function getDefaultCashAccount(businessId: string, shopId: string) {
  return Account.findOne({
    businessId: new Types.ObjectId(businessId),
    shopId: new Types.ObjectId(shopId),
    name: DEFAULT_CASH_ACCOUNT_NAME,
  });
}