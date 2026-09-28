"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { NOTIFICATION_REALTIME_EVENTS } from "@tripforge/contracts";
import { z } from "zod";

import { notificationKeys } from "@/lib/notifications/query-keys";
import { getRealtimeSocket } from "@/lib/realtime/socket";

const notificationInvalidateSchema = z.object({}).strict();

export function AuthenticatedRealtimeBridge() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const socket = getRealtimeSocket();
    let active = true;
    const invalidateNotifications = () => {
      if (active) {
        void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
      }
    };
    const onInvalidate = (raw: unknown) => {
      if (notificationInvalidateSchema.safeParse(raw).success) {
        invalidateNotifications();
      }
    };

    socket.on("connect", invalidateNotifications);
    socket.on(NOTIFICATION_REALTIME_EVENTS.invalidate, onInvalidate);
    socket.connect();

    return () => {
      active = false;
      socket.off("connect", invalidateNotifications);
      socket.off(NOTIFICATION_REALTIME_EVENTS.invalidate, onInvalidate);
      socket.disconnect();
    };
  }, [queryClient]);

  return null;
}
