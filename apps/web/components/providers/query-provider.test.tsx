import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ApiClientError } from "@/lib/api/errors";

import { QueryProvider, shouldRetryRequest } from "./query-provider";

describe("QueryProvider", () => {
  it("provides one client to its children", () => {
    render(
      <QueryProvider>
        <p>Query child</p>
      </QueryProvider>,
    );

    expect(screen.getByText("Query child")).toBeVisible();
  });

  it("does not retry deterministic client errors", () => {
    expect(
      shouldRetryRequest(
        0,
        new ApiClientError("Not found", 404, "TRIP_NOT_FOUND"),
      ),
    ).toBe(false);
  });

  it("retries a transient failure at most once", () => {
    expect(shouldRetryRequest(0, new TypeError("offline"))).toBe(true);
    expect(shouldRetryRequest(1, new TypeError("offline"))).toBe(false);
    expect(
      shouldRetryRequest(0, new ApiClientError("Unavailable", 503, "UNAVAILABLE")),
    ).toBe(true);
  });
});
