export class ApiError extends Error {
  status: number;
  code: string;
  fields?: Record<string, string[]>;

  constructor(status: number, message: string, code = "ERROR", fields?: Record<string, string[]>) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }

  static badRequest(message: string, fields?: Record<string, string[]>) {
    return new ApiError(400, message, "VALIDATION_ERROR", fields);
  }

  static unauthorized(message = "Unauthorized") {
    return new ApiError(401, message, "UNAUTHORIZED");
  }

  static forbidden(message = "Forbidden") {
    return new ApiError(403, message, "FORBIDDEN");
  }

  static notFound(message = "Not found") {
    return new ApiError(404, message, "NOT_FOUND");
  }

  static conflict(message: string) {
    return new ApiError(409, message, "CONFLICT");
  }

  static internal(message = "Internal server error") {
    return new ApiError(500, message, "INTERNAL_ERROR");
  }
}