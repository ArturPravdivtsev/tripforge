import type { ApiErrorResponse } from "@tripforge/contracts";

import { getApiBaseUrl } from "./config";
import { ApiClientError } from "./errors";

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

type ApiFetchOptions = Omit<RequestInit, "body"> & {
  json?: unknown;
};

function isApiError(value: unknown): value is ApiErrorResponse {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ApiErrorResponse>;

  return (
    typeof candidate.code === "string" &&
    typeof candidate.message === "string" &&
    typeof candidate.statusCode === "number"
  );
}

async function readJson(response: Response): Promise<unknown> {
  const body = await response.text();

  if (!body) {
    return undefined;
  }

  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new ApiClientError(
      "The API returned an invalid response",
      response.status,
      "INVALID_API_RESPONSE",
    );
  }
}

export async function apiFetch<T>(
  path: string,
  options: ApiFetchOptions = {},
): Promise<T> {
  const { json, ...requestOptions } = options;
  const method = (requestOptions.method ?? "GET").toUpperCase();
  const headers = new Headers(requestOptions.headers);

  if (MUTATION_METHODS.has(method)) {
    headers.set("X-TripForge-Request", "1");
  }

  if (json !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...requestOptions,
    body: json === undefined ? undefined : JSON.stringify(json),
    credentials: "include",
    headers,
    method,
  });
  const body = await readJson(response);

  if (!response.ok) {
    if (isApiError(body)) {
      throw new ApiClientError(
        body.message,
        body.statusCode,
        body.code,
        body.errors,
      );
    }

    throw new ApiClientError(
      "The request could not be completed",
      response.status,
      "REQUEST_FAILED",
    );
  }

  return body as T;
}
