import type {
  TripAccessRevokedEvent,
  TripDeletedEvent,
  TripInvalidateEvent,
  TripJoinRequest,
  TripJoinResponse,
  TripLeaveRequest,
  TripLeaveResponse,
  TripPresenceEvent,
} from "@tripforge/contracts";

export interface ClientToServerEvents {
  "trip:join": (
    payload: TripJoinRequest,
    acknowledgement: (response: TripJoinResponse) => void,
  ) => void;
  "trip:leave": (
    payload: TripLeaveRequest,
    acknowledgement: (response: TripLeaveResponse) => void,
  ) => void;
}

export interface ServerToClientEvents {
  "trip:access-revoked": (event: TripAccessRevokedEvent) => void;
  "trip:deleted": (event: TripDeletedEvent) => void;
  "trip:invalidate": (event: TripInvalidateEvent) => void;
  "trip:presence": (event: TripPresenceEvent) => void;
}

export interface SocketData {
  displayName: string | null;
  joinedTripIds: string[];
  sessionExpiresAt: number;
  sessionId: string;
  userId: string;
}
