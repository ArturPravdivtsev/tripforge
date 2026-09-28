import { HttpException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { TripPermissionsService } from "./trip-permissions.service";
import type { TripSearchRepository } from "./trip-search.repository";
import { TripSearchService } from "./trip-search.service";

describe("TripSearchService", () => {
  it("normalizes the query, deduplicates types and applies the default limit", async () => {
    const permissions = { requireReadable: vi.fn().mockResolvedValue({ role: "viewer" }) };
    const repository = { search: vi.fn().mockResolvedValue([]) };
    const service = new TripSearchService(
      permissions as unknown as TripPermissionsService,
      repository as unknown as TripSearchRepository,
    );

    await expect(
      service.search("user", "trip", {
        q: "  Kyoto  ",
        types: "destination,destination,expense",
      }),
    ).resolves.toEqual({ query: "Kyoto", results: [] });
    expect(permissions.requireReadable).toHaveBeenCalledWith("user", "trip");
    expect(repository.search).toHaveBeenCalledWith(
      "trip",
      "Kyoto",
      ["destination", "expense"],
      20,
    );
  });

  it.each([
    [{ q: " " }, "INVALID_SEARCH_QUERY"],
    [{ q: "x".repeat(101) }, "INVALID_SEARCH_QUERY"],
    [{ q: "ok", types: "route" }, "INVALID_SEARCH_TYPES"],
    [{ limit: "51", q: "ok" }, "INVALID_SEARCH_LIMIT"],
  ])("rejects invalid search input %#", async (input, code) => {
    const service = new TripSearchService(
      { requireReadable: vi.fn() } as unknown as TripPermissionsService,
      { search: vi.fn() } as unknown as TripSearchRepository,
    );

    try {
      await service.search("user", "trip", input);
      throw new Error("Expected search to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getResponse()).toMatchObject({ code });
    }
  });
});
