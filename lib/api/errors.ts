// One error type for every failed API call, so pages can show a clear message.
export type ErrorCode =
  | "VALIDATION"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "OUT_OF_STOCK"
  | "DEBT_LIMIT"
  | "RETURN_TOO_MUCH"
  | "ALREADY_REVERSED"
  | "MONTH_CLOSED"
  | "BAD_STATE"
  | "RATE_LIMITED"
  | "NETWORK";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public errors?: Record<string, string>,
    public code?: ErrorCode,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// status 0 = no answer from the server (offline, or the server is down)
export const NETWORK_ERROR = 0;
