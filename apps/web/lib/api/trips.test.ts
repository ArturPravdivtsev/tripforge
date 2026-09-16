import { afterEach, describe, expect, it, vi } from "vitest";

import { tripsApi } from "./trips";

const trip = {
  accessRole: "owner" as const,
  createdAt: "2027-01-01T00:00:00.000Z",
  endsOn: null,
  id: "11111111-1111-4111-8111-111111111111",
  name: "Japan 2027",
  startsOn: "2027-04-12",
  updatedAt: "2027-01-01T00:00:00.000Z",
};

const participant = {
  role: "viewer" as const,
  user: {
    displayName: "Friend",
    email: "friend@example.com",
    id: "22222222-2222-4222-8222-222222222222",
  },
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

  it("lists members using the nested Trip URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([participant])),
    );
    vi.stubGlobal("fetch", fetchMock);

    await tripsApi.listMembers(trip.id);

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `http://127.0.0.1:4000/api/trips/${trip.id}/members`,
    );
  });

  it.each([
    ["add", "POST", `/api/trips/${trip.id}/members`, { email: participant.user.email, role: "viewer" }],
    ["change role", "PATCH", `/api/trips/${trip.id}/members/${participant.user.id}`, { role: "editor" }],
  ] as const)("sends a secured member %s request", async (operation, method, path, body) => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(participant)),
    );
    vi.stubGlobal("fetch", fetchMock);

    if (operation === "add") {
      await tripsApi.addMember(trip.id, body);
    } else {
      await tripsApi.updateMemberRole(trip.id, participant.user.id, body);
    }

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(options.headers);
    expect(url).toBe(`http://127.0.0.1:4000${path}`);
    expect(options.method).toBe(method);
    expect(headers.get("X-TripForge-Request")).toBe("1");
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(options.body).toBe(JSON.stringify(body));
  });

  it("removes a member with the browser mutation header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await tripsApi.removeMember(trip.id, participant.user.id);

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(options.headers);
    expect(url).toBe(
      `http://127.0.0.1:4000/api/trips/${trip.id}/members/${participant.user.id}`,
    );
    expect(options.method).toBe("DELETE");
    expect(headers.get("X-TripForge-Request")).toBe("1");
  });
});
