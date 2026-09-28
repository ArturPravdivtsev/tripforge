import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { notificationKeys } from "@/lib/notifications/query-keys";

import { AuthenticatedRealtimeBridge } from "./authenticated-realtime-bridge";

type Handler = (payload?: unknown) => void;

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, Handler>();
  return {
    handlers,
    socket: {
      connect: vi.fn(),
      disconnect: vi.fn(),
      off: vi.fn(),
      on: vi.fn(),
    },
  };
});

vi.mock("@/lib/realtime/socket", () => ({
  getRealtimeSocket: () => mocks.socket,
}));

describe("AuthenticatedRealtimeBridge", () => {
  beforeEach(() => {
    mocks.handlers.clear();
    mocks.socket.connect.mockReset();
    mocks.socket.disconnect.mockReset();
    mocks.socket.on.mockReset().mockImplementation((event, handler) => {
      mocks.handlers.set(event, handler);
    });
    mocks.socket.off.mockReset().mockImplementation((event, handler) => {
      if (mocks.handlers.get(event) === handler) mocks.handlers.delete(event);
    });
  });

  afterEach(cleanup);

  it("owns the socket and heals notification queries on events and reconnect", () => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const view = render(
      <QueryClientProvider client={queryClient}>
        <AuthenticatedRealtimeBridge />
      </QueryClientProvider>,
    );

    expect(mocks.socket.connect).toHaveBeenCalledOnce();
    act(() => {
      mocks.handlers.get("notifications:invalidate")?.({});
      mocks.handlers.get("connect")?.();
      mocks.handlers.get("notifications:invalidate")?.({ forged: true });
    });
    expect(invalidate).toHaveBeenCalledTimes(2);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: notificationKeys.all });

    view.unmount();
    expect(mocks.socket.disconnect).toHaveBeenCalledOnce();
    expect(mocks.handlers.size).toBe(0);
  });
});
