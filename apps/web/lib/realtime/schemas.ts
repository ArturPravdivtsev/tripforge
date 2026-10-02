import { TRIP_REALTIME_RESOURCES } from "@tripforge/contracts";
import { z } from "zod";
import "@/lib/security/zod-csp";

const tripId = z.string().uuid();

export const tripInvalidateEventSchema = z.object({
  resources: z.array(z.enum(TRIP_REALTIME_RESOURCES)).min(1),
  tripId,
}).strict();

export const tripDeletedEventSchema = z.object({ tripId }).strict();
export const tripAccessRevokedEventSchema = z.object({ tripId }).strict();
export const tripPresenceEventSchema = z.object({
  tripId,
  users: z.array(
    z.object({
      displayName: z.string().nullable(),
      userId: z.string().uuid(),
    }).strict(),
  ),
}).strict();
