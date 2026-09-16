import { afterEach, describe, expect, it, vi } from "vitest";

import { tripsApi } from "./trips";

const trip = {
  createdAt: "2027-01-01T00:00:00.000Z",
  endsOn: null,
  id: "11111111-1111-4111-8111-111111111111",
  name: "Japan 2027",
  startsOn: "2027-04-12",
  updatedAt: "2027-01-01T00:00:00.000Z",
};

describe("tripsApi", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds paginated list URL and forwards AbortSignal", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ items: [], page: 2, pageSize: 6, total: 0, totalPages: 0 }),
      ),
    );
    const controller = new AbortController();
    vi.stubGlobal("fetch", fetchMock);

    await tripsApi.list({ page: 2, pageSize: 6 }, { signal: controller.signal });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:4000/api/trips?page=2&pageSize=6",
      expect.objectContaining({ credentials: "include", signal: controller.signal }),
    );
  });

  it("uses the detail URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(trip)));
    vi.stubGlobal("fetch", fetchMock);

    await tripsApi.get(trip.id);

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `http://127.0.0.1:4000/api/trips/${trip.id}`,
    );
  });

  it.each([
    ["create", "POST", "/api/trips", { name: "Japan 2027" }],
    ["update", "PATCH", `/api/trips/${trip.id}`, { name: "Japan 2028" }],
  ] as const)("sends a secured JSON %s request", async (operation, method, path, body) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(trip)));
    vi.stubGlobal("fetch", fetchMock);

    if (operation === "create") {
      await tripsApi.create(body);
    } else {
      await tripsApi.update(trip.id, body);
    }

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(options.headers);
    expect(url).toBe(`http://127.0.0.1:4000${path}`);
    expect(options.method).toBe(method);
    expect(options.credentials).toBe("include");
    expect(headers.get("X-TripForge-Request")).toBe("1");
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(options.body).toBe(JSON.stringify(body));
  });

  it("handles DELETE 204 without JSON parsing", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(tripsApi.remove(trip.id)).resolves.toBeUndefined();

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(options.headers);
    expect(options.method).toBe("DELETE");
    expect(headers.get("X-TripForge-Request")).toBe("1");
    expect(headers.has("Content-Type")).toBe(false);
  });
});
