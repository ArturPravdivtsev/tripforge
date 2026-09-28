import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { tripKeys } from "@/lib/trips/query-keys";

import { TripRealtimeBridge } from "./trip-realtime-bridge";

const TRIP_ID = "00000000-0000-4000-8000-000000000001";
const USER_ID = "00000000-0000-4000-8000-000000000002";

type Handler = (payload?: unknown) => void;

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, Handler>();
  const managerHandlers = new Map<string, Handler>();
  const replace = vi.fn();
  const router = { replace };
  const socket = {
    connected: false,
    connect: vi.fn(),
    disconnect: vi.fn(),
    emit: vi.fn(),
    io: { off: vi.fn(), on: vi.fn() },
    off: vi.fn(),
    on: vi.fn(),
  };
  return { handlers, managerHandlers, replace, router, socket };
});

vi.mock("next/navigation", () => ({
  useRouter: () => mocks.router,
}));

vi.mock("@/lib/realtime/socket", () => ({
  getRealtimeSocket: () => mocks.socket,
}));

describe("TripRealtimeBridge", () => {
  beforeEach(() => {
    mocks.handlers.clear();
    mocks.managerHandlers.clear();
    mocks.replace.mockReset();
    mocks.socket.connected = true;
    mocks.socket.connect.mockReset().mockImplementation(() => {
      mocks.socket.connected = true;
      mocks.handlers.get("connect")?.();
    });
    mocks.socket.disconnect.mockReset().mockImplementation(() => {
      mocks.socket.connected = false;
    });
    mocks.socket.emit.mockReset().mockImplementation((event, _payload, ack) => {
      if (event === "trip:join") ack?.({ accessRole: "editor", ok: true });
      if (event === "trip:leave") ack?.({ ok: true });
    });
    mocks.socket.on.mockReset().mockImplementation((event, handler) => {
      mocks.handlers.set(event, handler);
    });
    mocks.socket.off.mockReset().mockImplementation((event, handler) => {
      if (mocks.handlers.get(event) === handler) mocks.handlers.delete(event);
    });
    mocks.socket.io.on.mockReset().mockImplementation((event, handler) => {
      mocks.managerHandlers.set(event, handler);
    });
    mocks.socket.io.off.mockReset().mockImplementation((event, handler) => {
      if (mocks.managerHandlers.get(event) === handler) {
        mocks.managerHandlers.delete(event);
      }
    });
  });

  afterEach(cleanup);

  it("joins, displays presence, invalidates resources, and cleans listeners", async () => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const view = renderBridge(queryClient);

    expect(screen.getByText("Live")).toBeVisible();
    expect(mocks.socket.emit).toHaveBeenCalledWith(
      "trip:join",
      { tripId: TRIP_ID },
      expect.any(Function),
    );

    act(() => {
      mocks.handlers.get("trip:presence")?.({
        tripId: TRIP_ID,
        users: [{ displayName: "Anna", userId: USER_ID }],
      });
      mocks.handlers.get("trip:invalidate")?.({
        resources: ["members"],
        tripId: TRIP_ID,
      });
    });

    expect(screen.getByText("Anna")).toBeVisible();
    expect(invalidate).toHaveBeenCalledWith({
      exact: false,
      queryKey: tripKeys.members(TRIP_ID),
      refetchType: "active",
    });

    view.unmount();
    expect(mocks.socket.disconnect).not.toHaveBeenCalled();
    expect(mocks.socket.emit).toHaveBeenCalledWith(
      "trip:leave",
      { tripId: TRIP_ID },
      expect.any(Function),
    );
    expect(mocks.handlers.size).toBe(0);
    expect(mocks.managerHandlers.size).toBe(0);
  });

  it("redirects and clears Trip cache after revocation or deletion", () => {
    const queryClient = new QueryClient();
    const remove = vi.spyOn(queryClient, "removeQueries");
    renderBridge(queryClient);

    act(() => {
      mocks.handlers.get("trip:access-revoked")?.({ tripId: TRIP_ID });
      mocks.handlers.get("trip:deleted")?.({ tripId: TRIP_ID });
    });

    expect(remove).toHaveBeenCalledWith({ queryKey: tripKeys.detail(TRIP_ID) });
    expect(mocks.replace).toHaveBeenCalledWith("/trips");
  });

  it("shows reconnecting/unavailable states", () => {
    const queryClient = new QueryClient();
    renderBridge(queryClient);

    act(() => mocks.handlers.get("disconnect")?.());
    expect(screen.getByText("Reconnecting")).toBeVisible();

    act(() => mocks.handlers.get("connect_error")?.());
    expect(screen.getByText("Unavailable")).toBeVisible();
  });
});

function renderBridge(queryClient: QueryClient) {
  return render(
    <QueryClientProvider client={queryClient}>
      <TripRealtimeBridge tripId={TRIP_ID}>
        <p>Trip content</p>
      </TripRealtimeBridge>
    </QueryClientProvider>,
  );
}
