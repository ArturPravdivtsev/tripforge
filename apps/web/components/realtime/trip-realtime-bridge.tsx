"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  TRIP_REALTIME_EVENTS,
  TRIP_REALTIME_RESOURCES,
  type TripPresenceUser,
} from "@tripforge/contracts";

import { deferDuringItineraryReorder } from "@/lib/realtime/itinerary-invalidation";
import { invalidateRealtimeResources } from "@/lib/realtime/query-invalidation";
import {
  tripAccessRevokedEventSchema,
  tripDeletedEventSchema,
  tripInvalidateEventSchema,
  tripPresenceEventSchema,
} from "@/lib/realtime/schemas";
import { getRealtimeSocket } from "@/lib/realtime/socket";
import { tripKeys } from "@/lib/trips/query-keys";

type RealtimeStatus = "live" | "reconnecting" | "unavailable";

type TripRealtimeBridgeProps = Readonly<{
  children: ReactNode;
  tripId: string;
}>;

export function TripRealtimeBridge({
  children,
  tripId,
}: TripRealtimeBridgeProps) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [presence, setPresence] = useState<TripPresenceUser[]>([]);
  const [status, setStatus] = useState<RealtimeStatus>("reconnecting");

  useEffect(() => {
    const socket = getRealtimeSocket();
    let active = true;

    const redirectFromTrip = () => {
      queryClient.removeQueries({ queryKey: tripKeys.detail(tripId) });
      void queryClient.invalidateQueries({ queryKey: tripKeys.lists() });
      router.replace("/trips");
    };
    const join = () => {
      if (!active) return;
      setStatus("reconnecting");
      socket.emit(TRIP_REALTIME_EVENTS.join, { tripId }, (response) => {
        if (!active) return;
        if (!response.ok) {
          setStatus("unavailable");
          if (response.error.code === "TRIP_ACCESS_DENIED") redirectFromTrip();
          return;
        }
        setStatus("live");
        void invalidateRealtimeResources(
          queryClient,
          tripId,
          TRIP_REALTIME_RESOURCES,
        );
      });
    };
    const onDisconnect = () => {
      if (active) setStatus("reconnecting");
    };
    const onConnectError = () => {
      if (active) setStatus("unavailable");
    };
    const onReconnectAttempt = () => {
      if (active) setStatus("reconnecting");
    };
    const onInvalidate = (raw: unknown) => {
      const parsed = tripInvalidateEventSchema.safeParse(raw);
      if (!parsed.success || parsed.data.tripId !== tripId) return;
      const immediate = parsed.data.resources.filter(
        (resource) => resource !== "itinerary",
      );
      if (immediate.length > 0) {
        void invalidateRealtimeResources(queryClient, tripId, immediate);
      }
      if (parsed.data.resources.includes("itinerary")) {
        deferDuringItineraryReorder(tripId, () =>
          invalidateRealtimeResources(queryClient, tripId, ["itinerary"]),
        );
      }
    };
    const onPresence = (raw: unknown) => {
      const parsed = tripPresenceEventSchema.safeParse(raw);
      if (parsed.success && parsed.data.tripId === tripId) {
        setPresence(parsed.data.users);
      }
    };
    const onDeleted = (raw: unknown) => {
      const parsed = tripDeletedEventSchema.safeParse(raw);
      if (parsed.success && parsed.data.tripId === tripId) redirectFromTrip();
    };
    const onAccessRevoked = (raw: unknown) => {
      const parsed = tripAccessRevokedEventSchema.safeParse(raw);
      if (parsed.success && parsed.data.tripId === tripId) redirectFromTrip();
    };

    socket.on("connect", join);
    socket.on("connect_error", onConnectError);
    socket.on("disconnect", onDisconnect);
    socket.io.on("reconnect_attempt", onReconnectAttempt);
    socket.on(TRIP_REALTIME_EVENTS.invalidate, onInvalidate);
    socket.on(TRIP_REALTIME_EVENTS.presence, onPresence);
    socket.on(TRIP_REALTIME_EVENTS.deleted, onDeleted);
    socket.on(TRIP_REALTIME_EVENTS.accessRevoked, onAccessRevoked);
    socket.connect();

    return () => {
      active = false;
      if (socket.connected) {
        socket.emit(TRIP_REALTIME_EVENTS.leave, { tripId }, () => undefined);
      }
      socket.off("connect", join);
      socket.off("connect_error", onConnectError);
      socket.off("disconnect", onDisconnect);
      socket.io.off("reconnect_attempt", onReconnectAttempt);
      socket.off(TRIP_REALTIME_EVENTS.invalidate, onInvalidate);
      socket.off(TRIP_REALTIME_EVENTS.presence, onPresence);
      socket.off(TRIP_REALTIME_EVENTS.deleted, onDeleted);
      socket.off(TRIP_REALTIME_EVENTS.accessRevoked, onAccessRevoked);
      socket.disconnect();
    };
  }, [queryClient, router, tripId]);

  return (
    <>
      {children}
      <aside
        aria-live="polite"
        className="fixed bottom-3 right-3 z-40 max-w-[calc(100vw-1.5rem)] rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs shadow-sm sm:bottom-4 sm:right-4"
      >
        <div className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden="true"
            className={`size-2 shrink-0 rounded-full ${statusColor[status]}`}
          />
          <span className="font-semibold">{statusLabel[status]}</span>
          {presence.length > 0 ? (
            <span className="max-w-52 truncate text-[var(--muted-foreground)]">
              {presence
                .map(({ displayName }) => displayName ?? "Traveler")
                .join(", ")}
            </span>
          ) : null}
        </div>
      </aside>
    </>
  );
}

const statusLabel: Record<RealtimeStatus, string> = {
  live: "Live",
  reconnecting: "Reconnecting",
  unavailable: "Unavailable",
};

const statusColor: Record<RealtimeStatus, string> = {
  live: "bg-emerald-500",
  reconnecting: "bg-amber-500",
  unavailable: "bg-[var(--danger)]",
};
