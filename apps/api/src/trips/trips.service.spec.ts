import type { Trip } from "@tripforge/contracts";
import { describe, expect, it, vi } from "vitest";

import { TripRealtimePublisher } from "../realtime/trip-realtime.publisher";
import { TripDateChangeConflictError, TripsRepository } from "./trips.repository";
import { TripsService } from "./trips.service";

const trip: Trip = {
  accessRole: "owner",
  createdAt: "2026-09-12T10:00:00.000Z",
  endsOn: "2027-04-20",
  id: "00000000-0000-4000-8000-000000000001",
  name: "Japan 2027",
  startsOn: "2027-04-10",
  updatedAt: "2026-09-12T10:00:00.000Z",
};

function createSubject() {
  const repository = {
    addMember: vi.fn(),
    create: vi.fn(),
    deleteOwned: vi.fn(),
    findAccess: vi.fn(),
    findAccessibleById: vi.fn(),
    findUserByEmail: vi.fn(),
    listAccessible: vi.fn(),
    listParticipants: vi.fn(),
    removeMember: vi.fn(),
    updateAccessible: vi.fn(),
    updateMemberRole: vi.fn(),
  };
  const realtime = {
    accessRevoked: vi.fn(),
    invalidate: vi.fn(),
    notificationsChanged: vi.fn(),
    tripDeleted: vi.fn(),
  };

  return {
    realtime,
    repository,
    service: new TripsService(
      repository as unknown as TripsRepository,
      realtime as unknown as TripRealtimePublisher,
    ),
  };
}

describe("TripsService", () => {
  it("normalizes create input and preserves independently nullable dates", async () => {
    const { repository, service } = createSubject();
    repository.create.mockResolvedValue(trip);

    await service.create("user-1", {
      endsOn: null,
      name: "   Japan 2027   ",
      startsOn: "2027-04-12",
    });

    expect(repository.create).toHaveBeenCalledWith(
      "user-1",
      {
        endsOn: null,
        name: "Japan 2027",
        startsOn: "2027-04-12",
      },
      [],
    );
  });

  it("rejects invalid create ranges before persistence", async () => {
    const { repository, service } = createSubject();

    await expect(
      service.create("user-1", {
        endsOn: "2027-04-11",
        name: "Japan",
        startsOn: "2027-04-12",
      }),
    ).rejects.toMatchObject({ response: { code: "INVALID_TRIP_DATE_RANGE" } });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("validates a PATCH against the resulting stored date range", async () => {
    const { repository, service } = createSubject();
    repository.findAccessibleById.mockResolvedValue(trip);

    await expect(
      service.update("user-1", trip.id, { startsOn: "2027-04-25" }),
    ).rejects.toMatchObject({ response: { code: "INVALID_TRIP_DATE_RANGE" } });
    expect(repository.updateAccessible).not.toHaveBeenCalled();
  });

  it("distinguishes explicit null from an omitted PATCH field", async () => {
    const { repository, service } = createSubject();
    repository.findAccessibleById.mockResolvedValue(trip);
    repository.updateAccessible.mockResolvedValue({ ...trip, startsOn: null });

    await service.update("user-1", trip.id, { startsOn: null });

    expect(repository.updateAccessible).toHaveBeenCalledWith(
      "user-1",
      trip.id,
      { startsOn: null },
      [],
    );
  });

  it("translates populated-Day date protection into a stable conflict", async () => {
    const { repository, service } = createSubject();
    repository.findAccessibleById.mockResolvedValue(trip);
    repository.updateAccessible.mockRejectedValue(
      new TripDateChangeConflictError(),
    );

    await expect(
      service.update("user-1", trip.id, { startsOn: "2027-04-11" }),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: "TRIP_DATE_CHANGE_WOULD_REMOVE_ITINERARY" },
    });
  });

  it("rejects empty PATCH payloads", async () => {
    const { repository, service } = createSubject();

    await expect(service.update("user-1", trip.id, {})).rejects.toMatchObject({
      response: { code: "EMPTY_TRIP_UPDATE" },
    });
    expect(repository.findAccessibleById).not.toHaveBeenCalled();
  });

  it("uses the same not-found error for failed reads and mutations", async () => {
    const { repository, service } = createSubject();
    repository.findAccessibleById.mockResolvedValue(undefined);
    repository.deleteOwned.mockResolvedValue(false);
    repository.findAccess.mockResolvedValue(undefined);

    await expect(service.get("user-1", trip.id)).rejects.toMatchObject({
      response: { code: "TRIP_NOT_FOUND" },
    });
    await expect(service.delete("user-1", trip.id)).rejects.toMatchObject({
      response: { code: "TRIP_NOT_FOUND" },
    });
  });

  it("calculates consistent empty and populated pagination metadata", async () => {
    const { repository, service } = createSubject();
    repository.listAccessible
      .mockResolvedValueOnce({ items: [], total: 0 })
      .mockResolvedValueOnce({ items: [trip], total: 5 });

    await expect(service.list("user-1", 1, 20)).resolves.toMatchObject({
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 0,
    });
    await expect(service.list("user-1", 2, 2)).resolves.toMatchObject({
      page: 2,
      pageSize: 2,
      total: 5,
      totalPages: 3,
    });
  });

  it("allows editors to update and rejects viewers", async () => {
    const { repository, service } = createSubject();
    repository.findAccessibleById
      .mockResolvedValueOnce({ ...trip, accessRole: "editor" })
      .mockResolvedValueOnce({ ...trip, accessRole: "viewer" });
    repository.updateAccessible.mockResolvedValue({
      ...trip,
      accessRole: "editor",
      name: "Edited",
    });

    await expect(
      service.update("editor", trip.id, { name: "Edited" }),
    ).resolves.toMatchObject({ accessRole: "editor", name: "Edited" });
    await expect(
      service.update("viewer", trip.id, { name: "Blocked" }),
    ).rejects.toMatchObject({
      response: { code: "INSUFFICIENT_TRIP_PERMISSION" },
    });
  });

  it("returns forbidden for member deletes and not found for unrelated users", async () => {
    const { repository, service } = createSubject();
    repository.deleteOwned.mockResolvedValue(false);
    repository.findAccess
      .mockResolvedValueOnce({ ownerId: "owner", role: "editor" })
      .mockResolvedValueOnce(undefined);

    await expect(service.delete("editor", trip.id)).rejects.toMatchObject({
      response: { code: "INSUFFICIENT_TRIP_PERMISSION" },
    });
    await expect(service.delete("unrelated", trip.id)).rejects.toMatchObject({
      response: { code: "TRIP_NOT_FOUND" },
    });
  });

  it("prevents the owner from becoming a member", async () => {
    const { repository, service } = createSubject();
    repository.findAccess.mockResolvedValue({ ownerId: "owner", role: "owner" });
    repository.findUserByEmail.mockResolvedValue({
      displayName: null,
      email: "owner@example.com",
      id: "owner",
    });

    await expect(
      service.addMember("owner", trip.id, {
        email: " OWNER@example.com ",
        role: "editor",
      }),
    ).rejects.toMatchObject({
      response: { code: "TRIP_OWNER_CANNOT_BE_MEMBER" },
    });
    expect(repository.findUserByEmail).toHaveBeenCalledWith("owner@example.com");
    expect(repository.addMember).not.toHaveBeenCalled();
  });

  it("translates duplicate membership into a stable conflict", async () => {
    const { repository, service } = createSubject();
    repository.findAccess.mockResolvedValue({ ownerId: "owner", role: "owner" });
    repository.findUserByEmail.mockResolvedValue({
      displayName: "Editor",
      email: "editor@example.com",
      id: "editor",
    });
    repository.addMember.mockResolvedValue(false);

    await expect(
      service.addMember("owner", trip.id, {
        email: "editor@example.com",
        role: "editor",
      }),
    ).rejects.toMatchObject({
      response: { code: "TRIP_MEMBER_ALREADY_EXISTS" },
    });
  });

  it("publishes notification invalidation only after a member is added", async () => {
    const { realtime, repository, service } = createSubject();
    repository.findAccess.mockResolvedValue({ ownerId: "owner", role: "owner" });
    repository.findUserByEmail.mockResolvedValue({
      displayName: "Viewer",
      email: "viewer@example.com",
      id: "viewer",
    });
    repository.addMember.mockResolvedValue(true);

    await service.addMember("owner", trip.id, {
      email: "viewer@example.com",
      role: "viewer",
    });

    expect(realtime.notificationsChanged).toHaveBeenCalledWith(["viewer"]);
    expect(realtime.invalidate).toHaveBeenCalledWith(trip.id, [
      "members",
      "trip",
    ]);
  });

  it("does not publish a notification for a no-op role update", async () => {
    const { realtime, repository, service } = createSubject();
    repository.findAccess.mockResolvedValue({ ownerId: "owner", role: "owner" });
    repository.updateMemberRole.mockResolvedValue({ changed: false, found: true });
    repository.listParticipants.mockResolvedValue([
      { role: "owner", user: { displayName: "Owner", email: "o@x.io", id: "owner" } },
      { role: "viewer", user: { displayName: "Viewer", email: "v@x.io", id: "viewer" } },
    ]);

    await service.updateMemberRole("owner", trip.id, "viewer", "viewer");

    expect(realtime.notificationsChanged).not.toHaveBeenCalled();
    expect(realtime.invalidate).not.toHaveBeenCalled();
  });

  it("publishes deletion and inbox invalidation after a committed delete", async () => {
    const { realtime, repository, service } = createSubject();
    repository.deleteOwned.mockResolvedValue(["editor", "viewer"]);

    await service.delete("owner", trip.id);

    expect(realtime.tripDeleted).toHaveBeenCalledWith(trip.id);
    expect(realtime.notificationsChanged).toHaveBeenCalledWith([
      "editor",
      "viewer",
    ]);
  });
});
