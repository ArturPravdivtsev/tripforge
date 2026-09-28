import { afterEach, describe, expect, it, vi } from "vitest";

import { notificationsApi } from "./notifications";

describe("notificationsApi", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("builds the cursor list URL and forwards AbortSignal", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: [], nextCursor: null })),
    );
    const controller = new AbortController();
    vi.stubGlobal("fetch", fetchMock);

    await notificationsApi.list(
      { cursor: "opaque cursor", limit: 12 },
      { signal: controller.signal },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:4000/api/notifications?limit=12&cursor=opaque+cursor",
      expect.objectContaining({ credentials: "include", signal: controller.signal }),
    );
  });

  it("sends a secured read-state mutation", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({})));
    vi.stubGlobal("fetch", fetchMock);

    await notificationsApi.setReadState("notification-id", true);

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(options.headers);
    expect(url).toBe(
      "http://127.0.0.1:4000/api/notifications/notification-id",
    );
    expect(options.method).toBe("PATCH");
    expect(options.body).toBe(JSON.stringify({ read: true }));
    expect(headers.get("X-TripForge-Request")).toBe("1");
  });

  it("uses the dedicated unread-count and read-all endpoints", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ unreadCount: 2 })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ updatedCount: 2 })));
    vi.stubGlobal("fetch", fetchMock);

    await notificationsApi.unreadCount();
    await notificationsApi.markAllRead();

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "http://127.0.0.1:4000/api/notifications/unread-count",
    );
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "http://127.0.0.1:4000/api/notifications/read-all",
    );
    expect(fetchMock.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({ method: "POST" }),
    );
  });
});
