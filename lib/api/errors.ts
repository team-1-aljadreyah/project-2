// One error type for every failed API call, so pages can show a clear message.
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public errors?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// status 0 = no answer from the server (offline, or the server is down)
export const NETWORK_ERROR = 0;
