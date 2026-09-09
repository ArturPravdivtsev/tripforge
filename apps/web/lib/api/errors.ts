export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly errors?: string[],
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}
