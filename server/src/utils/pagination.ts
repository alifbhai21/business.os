export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/** Parse page/limit from query params with safe clamps (page ≥ 1, 1 ≤ limit ≤ 100). */
export function parsePagination(query: Record<string, unknown>): PaginationParams {
  const rawPage = Number(query.page);
  const rawLimit = Number(query.limit);
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const limit =
    Number.isInteger(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, MAX_LIMIT)
      : DEFAULT_LIMIT;
  return { page, limit, skip: (page - 1) * limit };
}

export interface PaginationResult {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export function buildPagination(total: number, params: PaginationParams): PaginationResult {
  return {
    total,
    page: params.page,
    limit: params.limit,
    totalPages: Math.max(1, Math.ceil(total / params.limit)),
  };
}
