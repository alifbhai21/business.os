import { Types, ClientSession } from "mongoose";
import { JournalEntry, JournalEntryDocument, JournalReferenceType } from "../models/JournalEntry";
import { JournalLine, JournalLineDocument } from "../models/JournalLine";
import { JournalAccountType } from "../config/accounts";
import { assertSafePaisa } from "../utils/money";
import { ApiError } from "../utils/ApiError";
import { withTransaction } from "../db/transactions";

export interface JournalLineInput {
  accountName: string;
  accountType: JournalAccountType;
  debit: number;
  credit: number;
}

export interface JournalInput {
  businessId: string;
  shopId: string;
  description: string;
  referenceType: JournalReferenceType;
  referenceId?: string | null;
  /** Offline-sync idempotency anchor (optional; unique per business+type). */
  localId?: string | null;
  lines: JournalLineInput[];
}

export interface JournalResult {
  entry: JournalEntryDocument;
  lines: JournalLineDocument[];
}

export function validateJournalLines(lines: JournalLineInput[]): void {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw ApiError.badRequest("Journal must have at least one line");
  }
  let totalDebit = 0;
  let totalCredit = 0;
  for (const line of lines) {
    assertSafePaisa(line.debit, "debit");
    assertSafePaisa(line.credit, "credit");
    if (line.debit < 0 || line.credit < 0) {
      throw ApiError.badRequest("Debit and credit must be non-negative");
    }
    if (line.debit === 0 && line.credit === 0) {
      throw ApiError.badRequest("Each journal line must have a non-zero debit or credit");
    }
    if (line.debit > 0 && line.credit > 0) {
      throw ApiError.badRequest("A journal line cannot have both debit and credit");
    }
    if (!line.accountName || !line.accountName.trim()) {
      throw ApiError.badRequest("Journal line accountName is required");
    }
    totalDebit += line.debit;
    totalCredit += line.credit;
  }
  if (totalDebit !== totalCredit) {
    throw ApiError.badRequest(
      `Unbalanced journal: debit ${totalDebit} !== credit ${totalCredit}`
    );
  }
}

export async function writeJournal(
  input: JournalInput,
  session?: ClientSession | null
): Promise<JournalResult> {
  validateJournalLines(input.lines);

  const entry = await JournalEntry.create(
    [
      {
        businessId: new Types.ObjectId(input.businessId),
        shopId: new Types.ObjectId(input.shopId),
        description: input.description,
        referenceType: input.referenceType,
        referenceId: input.referenceId ? new Types.ObjectId(input.referenceId) : null,
        localId: input.localId ?? null,
        isReversal: false,
        reversesEntryId: null,
      },
    ],
    { session: session ?? undefined, ordered: true }
  );

  const lines = await JournalLine.create(
    input.lines.map((line) => ({
      entryId: entry[0]._id,
      accountName: line.accountName,
      accountType: line.accountType,
      debit: line.debit,
      credit: line.credit,
    })),
    { session: session ?? undefined, ordered: true }
  );

  return { entry: entry[0], lines };
}

export async function reverseJournal(
  businessId: string,
  shopId: string,
  originalEntryId: string,
  description: string,
  session?: ClientSession | null
): Promise<JournalResult> {
  const original = await JournalEntry.findOne({
    _id: new Types.ObjectId(originalEntryId),
    businessId: new Types.ObjectId(businessId),
    shopId: new Types.ObjectId(shopId),
  });
  if (!original) throw ApiError.notFound("Journal entry not found");
  if (original.isReversal) {
    throw ApiError.badRequest("Cannot reverse a reversing entry");
  }

  const originalLines = await JournalLine.find({ entryId: original._id });
  if (originalLines.length === 0) {
    throw ApiError.badRequest("Original journal has no lines to reverse");
  }

  const entry = await JournalEntry.create(
    [
      {
        businessId: new Types.ObjectId(businessId),
        shopId: new Types.ObjectId(shopId),
        description,
        referenceType: "REVERSAL",
        referenceId: original.referenceId,
        isReversal: true,
        reversesEntryId: original._id,
      },
    ],
    { session: session ?? undefined, ordered: true }
  );

  const lines = await JournalLine.create(
    originalLines.map((line) => ({
      entryId: entry[0]._id,
      accountName: line.accountName,
      accountType: line.accountType,
      debit: line.credit,
      credit: line.debit,
    })),
    { session: session ?? undefined, ordered: true }
  );

  return { entry: entry[0], lines };
}

export async function writeJournalAtomic(input: JournalInput): Promise<JournalResult> {
  return withTransaction(async (session) => writeJournal(input, session));
}

export async function reverseJournalAtomic(
  businessId: string,
  shopId: string,
  originalEntryId: string,
  description: string
): Promise<JournalResult> {
  return withTransaction(async (session) =>
    reverseJournal(businessId, shopId, originalEntryId, description, session)
  );
}