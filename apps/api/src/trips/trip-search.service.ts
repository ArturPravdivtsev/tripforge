import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import {
  TRIP_SEARCH_RESULT_TYPES,
  type TripSearchResponse,
  type TripSearchResultType,
} from "@tripforge/contracts";

import type { SearchTripQueryDto } from "./dto/search-trip-query.dto";
import { TripPermissionsService } from "./trip-permissions.service";
import { TripSearchRepository } from "./trip-search.repository";

const DEFAULT_SEARCH_LIMIT = 20;
const MAX_SEARCH_LIMIT = 50;
const allowedTypes = new Set<string>(TRIP_SEARCH_RESULT_TYPES);

@Injectable()
export class TripSearchService {
  constructor(
    private readonly permissions: TripPermissionsService,
    private readonly searchRepository: TripSearchRepository,
  ) {}

  async search(
    userId: string,
    tripId: string,
    input: SearchTripQueryDto,
  ): Promise<TripSearchResponse> {
    const query = parseQuery(input.q);
    const types = parseTypes(input.types);
    const limit = parseLimit(input.limit);

    await this.permissions.requireReadable(userId, tripId);

    return {
      query,
      results: await this.searchRepository.search(tripId, query, types, limit),
    };
  }
}

function parseQuery(value: unknown): string {
  const query = typeof value === "string" ? value.trim() : "";

  if (query.length < 2 || query.length > 100) {
    throw new HttpException(
      {
        code: "INVALID_SEARCH_QUERY",
        message: "Search query must contain between 2 and 100 characters",
      },
      HttpStatus.BAD_REQUEST,
    );
  }

  return query;
}

function parseTypes(value: unknown): TripSearchResultType[] {
  if (value === undefined) {
    return [...TRIP_SEARCH_RESULT_TYPES];
  }

  if (typeof value !== "string") {
    throw invalidTypes();
  }

  const values = [...new Set(value.split(",").map((type) => type.trim()))];
  if (values.length === 0 || values.some((type) => !allowedTypes.has(type))) {
    throw invalidTypes();
  }

  return values as TripSearchResultType[];
}

function invalidTypes(): HttpException {
  return new HttpException(
    { code: "INVALID_SEARCH_TYPES", message: "Search types are invalid" },
    HttpStatus.BAD_REQUEST,
  );
}

function parseLimit(value: unknown): number {
  if (value === undefined) {
    return DEFAULT_SEARCH_LIMIT;
  }

  const limit = typeof value === "string" && value !== "" ? Number(value) : NaN;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_SEARCH_LIMIT) {
    throw new HttpException(
      {
        code: "INVALID_SEARCH_LIMIT",
        message: `Search limit must be between 1 and ${MAX_SEARCH_LIMIT}`,
      },
      HttpStatus.BAD_REQUEST,
    );
  }

  return limit;
}
