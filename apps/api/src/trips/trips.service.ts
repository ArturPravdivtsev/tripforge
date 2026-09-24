import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import type {
  AddTripMemberRequest,
  CreateTripRequest,
  Trip,
  TripMemberRole,
  TripParticipant,
  TripsPage,
  UpdateTripRequest,
} from "@tripforge/contracts";

import { normalizeEmail } from "../auth/email-normalizer";
import { TripRealtimePublisher } from "../realtime/trip-realtime.publisher";
import { generateTripDates } from "./trip-calendar";
import {
  TripDateChangeConflictError,
  TripsRepository,
  type TripAccess,
} from "./trips.repository";

@Injectable()
export class TripsService {
  constructor(
    private readonly tripsRepository: TripsRepository,
    private readonly realtime: TripRealtimePublisher,
  ) {}

  async create(ownerId: string, input: CreateTripRequest): Promise<Trip> {
    const normalized = {
      endsOn: input.endsOn ?? null,
      name: input.name.trim(),
      startsOn: input.startsOn ?? null,
    };

    this.assertDateRange(normalized.startsOn, normalized.endsOn);

    return this.tripsRepository.create(
      ownerId,
      normalized,
      generateTripDates(normalized.startsOn, normalized.endsOn),
    );
  }

  async list(
    userId: string,
    page: number,
    pageSize: number,
  ): Promise<TripsPage> {
    const result = await this.tripsRepository.listAccessible(
      userId,
      page,
      pageSize,
    );

    return {
      ...result,
      page,
      pageSize,
      totalPages: result.total === 0 ? 0 : Math.ceil(result.total / pageSize),
    };
  }

  async get(userId: string, tripId: string): Promise<Trip> {
    const trip = await this.tripsRepository.findAccessibleById(userId, tripId);

    if (!trip) {
      throw this.notFound();
    }

    return trip;
  }

  async update(
    userId: string,
    tripId: string,
    input: UpdateTripRequest,
  ): Promise<Trip> {
    const hasName = input.name !== undefined;
    const hasStartsOn = input.startsOn !== undefined;
    const hasEndsOn = input.endsOn !== undefined;

    if (!hasName && !hasStartsOn && !hasEndsOn) {
      throw new HttpException(
        {
          code: "EMPTY_TRIP_UPDATE",
          message: "Provide at least one field to update",
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const current = await this.get(userId, tripId);

    if (current.accessRole === "viewer") {
      throw this.insufficientPermission();
    }

    const update: UpdateTripRequest = {};

    if (hasName) {
      update.name = input.name?.trim();
    }

    if (hasStartsOn) {
      update.startsOn = input.startsOn ?? null;
    }

    if (hasEndsOn) {
      update.endsOn = input.endsOn ?? null;
    }

    this.assertDateRange(
      hasStartsOn ? (update.startsOn ?? null) : current.startsOn,
      hasEndsOn ? (update.endsOn ?? null) : current.endsOn,
    );

    let updated: Trip | undefined;

    try {
      updated = await this.tripsRepository.updateAccessible(
        userId,
        tripId,
        update,
        hasStartsOn || hasEndsOn
          ? generateTripDates(
              hasStartsOn ? (update.startsOn ?? null) : current.startsOn,
              hasEndsOn ? (update.endsOn ?? null) : current.endsOn,
            )
          : undefined,
      );
    } catch (error) {
      if (error instanceof TripDateChangeConflictError) {
        throw new HttpException(
          {
            code: "TRIP_DATE_CHANGE_WOULD_REMOVE_ITINERARY",
            message:
              "This date change would remove planned itinerary items. Move or delete those items first.",
          },
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }

    if (!updated) {
      const access = await this.tripsRepository.findAccess(userId, tripId);

      if (access?.role === "viewer") {
        throw this.insufficientPermission();
      }

      throw this.notFound();
    }

    this.realtime.invalidate(
      tripId,
      hasStartsOn || hasEndsOn ? ["trip", "days", "itinerary"] : ["trip"],
    );
    return updated;
  }

  async delete(userId: string, tripId: string): Promise<void> {
    const deleted = await this.tripsRepository.deleteOwned(userId, tripId);

    if (deleted) {
      this.realtime.tripDeleted(tripId);
      return;
    }

    const access = await this.tripsRepository.findAccess(userId, tripId);

    if (access) {
      throw this.insufficientPermission();
    }

    throw this.notFound();
  }

  async listParticipants(
    userId: string,
    tripId: string,
  ): Promise<TripParticipant[]> {
    await this.requireAccess(userId, tripId);
    const participants = await this.tripsRepository.listParticipants(tripId);

    if (!participants) {
      throw this.notFound();
    }

    return participants;
  }

  async addMember(
    userId: string,
    tripId: string,
    input: AddTripMemberRequest,
  ): Promise<TripParticipant> {
    const access = await this.requireOwner(userId, tripId);
    const invitee = await this.tripsRepository.findUserByEmail(
      normalizeEmail(input.email),
    );

    if (!invitee) {
      throw new HttpException(
        { code: "INVITEE_NOT_FOUND", message: "Invitee account not found" },
        HttpStatus.NOT_FOUND,
      );
    }

    if (invitee.id === access.ownerId) {
      throw new HttpException(
        {
          code: "TRIP_OWNER_CANNOT_BE_MEMBER",
          message: "Trip owner cannot be added as a member",
        },
        HttpStatus.CONFLICT,
      );
    }

    const inserted = await this.tripsRepository.addMember(
      tripId,
      invitee.id,
      input.role,
    );

    if (!inserted) {
      throw new HttpException(
        {
          code: "TRIP_MEMBER_ALREADY_EXISTS",
          message: "Trip member already exists",
        },
        HttpStatus.CONFLICT,
      );
    }

    this.realtime.invalidate(tripId, ["members", "trip"]);
    return { role: input.role, user: invitee };
  }

  async updateMemberRole(
    userId: string,
    tripId: string,
    memberUserId: string,
    role: TripMemberRole,
  ): Promise<TripParticipant> {
    const access = await this.requireOwner(userId, tripId);

    if (memberUserId === access.ownerId) {
      throw new HttpException(
        {
          code: "TRIP_OWNER_CANNOT_BE_MEMBER",
          message: "Trip owner does not have a membership role",
        },
        HttpStatus.CONFLICT,
      );
    }

    const updated = await this.tripsRepository.updateMemberRole(
      tripId,
      memberUserId,
      role,
    );

    if (!updated) {
      throw this.memberNotFound();
    }

    const participants = await this.tripsRepository.listParticipants(tripId);
    const participant = participants?.find(
      ({ user }) => user.id === memberUserId,
    );

    if (!participant) {
      throw this.memberNotFound();
    }

    this.realtime.invalidate(tripId, ["members", "trip"]);
    return participant;
  }

  async removeMember(
    userId: string,
    tripId: string,
    memberUserId: string,
  ): Promise<void> {
    const access = await this.requireOwner(userId, tripId);

    if (memberUserId === access.ownerId) {
      throw new HttpException(
        {
          code: "TRIP_OWNER_CANNOT_BE_REMOVED",
          message: "Trip owner cannot be removed",
        },
        HttpStatus.CONFLICT,
      );
    }

    const removed = await this.tripsRepository.removeMember(
      tripId,
      memberUserId,
    );

    if (!removed) {
      throw this.memberNotFound();
    }

    this.realtime.accessRevoked(tripId, memberUserId);
    this.realtime.invalidate(tripId, ["members", "trip"]);
  }

  private async requireAccess(
    userId: string,
    tripId: string,
  ): Promise<TripAccess> {
    const access = await this.tripsRepository.findAccess(userId, tripId);

    if (!access) {
      throw this.notFound();
    }

    return access;
  }

  private async requireOwner(
    userId: string,
    tripId: string,
  ): Promise<TripAccess> {
    const access = await this.requireAccess(userId, tripId);

    if (access.role !== "owner") {
      throw this.insufficientPermission();
    }

    return access;
  }

  private assertDateRange(
    startsOn: string | null,
    endsOn: string | null,
  ): void {
    if (startsOn && endsOn && endsOn < startsOn) {
      throw new HttpException(
        {
          code: "INVALID_TRIP_DATE_RANGE",
          message: "Trip end date cannot be before its start date",
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private insufficientPermission(): HttpException {
    return new HttpException(
      {
        code: "INSUFFICIENT_TRIP_PERMISSION",
        message: "Your Trip role does not allow this action",
      },
      HttpStatus.FORBIDDEN,
    );
  }

  private memberNotFound(): HttpException {
    return new HttpException(
      { code: "TRIP_MEMBER_NOT_FOUND", message: "Trip member not found" },
      HttpStatus.NOT_FOUND,
    );
  }

  private notFound(): HttpException {
    return new HttpException(
      { code: "TRIP_NOT_FOUND", message: "Trip not found" },
      HttpStatus.NOT_FOUND,
    );
  }
}
