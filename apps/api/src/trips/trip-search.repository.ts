import { Inject, Injectable } from "@nestjs/common";
import type {
  ItineraryItemKind,
  TripDocumentContentType,
  TripDocumentKind,
  TripExpenseCategory,
  TripReservationKind,
  TripSearchResult,
  TripSearchResultType,
} from "@tripforge/contracts";
import { sql } from "drizzle-orm";

import { DATABASE } from "../database/database.constants";
import type { Database } from "../database/database.provider";

type SearchRow = {
  category: string | null;
  contentType: string | null;
  date: string | null;
  fileName: string | null;
  id: string;
  kind: string | null;
  latitude: number | null;
  longitude: number | null;
  placeName: string | null;
  relevance: number;
  serviceNumber: string | null;
  startTime: string | null;
  title: string;
  type: TripSearchResultType;
};

@Injectable()
export class TripSearchRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async search(
    tripId: string,
    query: string,
    types: readonly TripSearchResultType[],
    limit: number,
  ): Promise<TripSearchResult[]> {
    const enabled = new Set(types);
    const result = await this.database.execute<SearchRow>(sql`
      with search_query as (
        select
          websearch_to_tsquery('simple'::regconfig, ${query}) as tsq,
          lower(${query}) as needle,
          ${query}::text as raw_query
      ), matches as (
        select
          'destination'::text as type,
          d.id,
          d.name::text as title,
          null::text as kind,
          null::text as date,
          null::text as start_time,
          null::text as place_name,
          null::text as service_number,
          null::text as category,
          null::text as file_name,
          null::text as content_type,
          d.latitude,
          d.longitude,
          (
            case when lower(d.name) = q.needle then 100 else 0 end +
            case when d.name ilike q.raw_query || '%' then 45 else 0 end +
            similarity(d.name, q.raw_query) * 25 +
            ts_rank_cd(d.search_vector, q.tsq, 32) * 15
          )::double precision as relevance
        from trip_destinations d
        cross join search_query q
        where ${enabled.has("destination")}
          and d.trip_id = ${tripId}::uuid
          and (
            d.search_vector @@ q.tsq
            or d.name % q.raw_query
            or similarity(d.name, q.raw_query) >= 0.2
          )

        union all

        select
          'itinerary'::text,
          i.id,
          i.title::text,
          i.kind::text,
          td.date::text,
          i.start_time::text,
          i.place_name::text,
          null::text,
          null::text,
          null::text,
          null::text,
          null::double precision,
          null::double precision,
          (
            case when lower(i.title) = q.needle or lower(coalesce(i.place_name, '')) = q.needle then 100 else 0 end +
            case when i.title ilike q.raw_query || '%' or i.place_name ilike q.raw_query || '%' then 45 else 0 end +
            greatest(similarity(i.title, q.raw_query), similarity(coalesce(i.place_name, ''), q.raw_query)) * 25 +
            ts_rank_cd(i.search_vector, q.tsq, 32) * 15
          )::double precision
        from itinerary_items i
        join trip_days td on td.id = i.trip_day_id
        cross join search_query q
        where ${enabled.has("itinerary")}
          and td.trip_id = ${tripId}::uuid
          and (
            i.search_vector @@ q.tsq
            or i.title % q.raw_query
            or i.place_name % q.raw_query
            or similarity(i.title, q.raw_query) >= 0.2
            or similarity(coalesce(i.place_name, ''), q.raw_query) >= 0.2
          )

        union all

        select
          'reservation'::text,
          r.id,
          r.title::text,
          r.kind::text,
          r.start_date::text,
          r.start_time::text,
          r.location_name::text,
          rt.service_number::text,
          null::text,
          null::text,
          null::text,
          null::double precision,
          null::double precision,
          (
            case when lower(r.title) = q.needle or lower(coalesce(rt.service_number, '')) = q.needle then 100 else 0 end +
            case when r.title ilike q.raw_query || '%' or rt.service_number ilike q.raw_query || '%' then 45 else 0 end +
            greatest(similarity(r.title, q.raw_query), similarity(coalesce(rt.service_number, ''), q.raw_query)) * 25 +
            (ts_rank_cd(r.search_vector, q.tsq, 32) + coalesce(ts_rank_cd(rt.search_vector, q.tsq, 32), 0)) * 15
          )::double precision
        from trip_reservations r
        left join reservation_transport_details rt on rt.reservation_id = r.id
        cross join search_query q
        where ${enabled.has("reservation")}
          and r.trip_id = ${tripId}::uuid
          and (
            r.search_vector @@ q.tsq
            or rt.search_vector @@ q.tsq
            or r.title % q.raw_query
            or rt.service_number % q.raw_query
            or similarity(r.title, q.raw_query) >= 0.2
            or similarity(coalesce(rt.service_number, ''), q.raw_query) >= 0.2
          )

        union all

        select
          'expense'::text,
          e.id,
          e.title::text,
          null::text,
          e.spent_on::text,
          null::text,
          null::text,
          null::text,
          e.category::text,
          null::text,
          null::text,
          null::double precision,
          null::double precision,
          (
            case when lower(e.title) = q.needle then 100 else 0 end +
            case when e.title ilike q.raw_query || '%' then 45 else 0 end +
            similarity(e.title, q.raw_query) * 25 +
            ts_rank_cd(e.search_vector, q.tsq, 32) * 15
          )::double precision
        from trip_expenses e
        cross join search_query q
        where ${enabled.has("expense")}
          and e.trip_id = ${tripId}::uuid
          and (
            e.search_vector @@ q.tsq
            or e.title % q.raw_query
            or similarity(e.title, q.raw_query) >= 0.2
          )

        union all

        select
          'document'::text,
          doc.id,
          doc.title::text,
          doc.kind::text,
          null::text,
          null::text,
          null::text,
          null::text,
          null::text,
          doc.original_file_name::text,
          doc.content_type::text,
          null::double precision,
          null::double precision,
          (
            case when lower(doc.title) = q.needle or lower(doc.original_file_name) = q.needle then 100 else 0 end +
            case when doc.title ilike q.raw_query || '%' or doc.original_file_name ilike q.raw_query || '%' then 45 else 0 end +
            greatest(similarity(doc.title, q.raw_query), similarity(doc.original_file_name, q.raw_query)) * 25 +
            ts_rank_cd(doc.search_vector, q.tsq, 32) * 15
          )::double precision
        from trip_documents doc
        cross join search_query q
        where ${enabled.has("document")}
          and doc.trip_id = ${tripId}::uuid
          and doc.status = 'ready'
          and (
            doc.search_vector @@ q.tsq
            or doc.title % q.raw_query
            or doc.original_file_name % q.raw_query
            or similarity(doc.title, q.raw_query) >= 0.2
            or similarity(doc.original_file_name, q.raw_query) >= 0.2
          )
      )
      select
        type,
        id,
        title,
        kind,
        date,
        start_time as "startTime",
        place_name as "placeName",
        service_number as "serviceNumber",
        category,
        file_name as "fileName",
        content_type as "contentType",
        latitude,
        longitude,
        relevance
      from matches
      order by relevance desc, type asc, id asc
      limit ${limit}
    `);

    return result.rows.map((row) => toSearchResult(tripId, row));
  }
}

function toSearchResult(tripId: string, row: SearchRow): TripSearchResult {
  switch (row.type) {
    case "destination":
      return {
        context: { latitude: row.latitude, longitude: row.longitude },
        id: row.id,
        subtitle: "Destination",
        target: { tripId, type: "trip" },
        title: row.title,
        type: row.type,
      };
    case "itinerary":
      return {
        context: {
          date: required(row.date),
          kind: required(row.kind) as ItineraryItemKind,
          placeName: row.placeName,
          startTime: row.startTime,
        },
        id: row.id,
        subtitle: joinSubtitle(row.kind, row.date, row.startTime, row.placeName),
        target: { tripId, type: "trip" },
        title: row.title,
        type: row.type,
      };
    case "reservation":
      return {
        context: {
          kind: required(row.kind) as TripReservationKind,
          serviceNumber: row.serviceNumber,
          startDate: required(row.date),
        },
        id: row.id,
        subtitle: joinSubtitle(row.kind, row.date, row.serviceNumber),
        target: { tripId, type: "reservations" },
        title: row.title,
        type: row.type,
      };
    case "expense":
      return {
        context: {
          category: required(row.category) as TripExpenseCategory,
          spentOn: required(row.date),
        },
        id: row.id,
        subtitle: joinSubtitle(row.category, row.date),
        target: { tripId, type: "expenses" },
        title: row.title,
        type: row.type,
      };
    case "document":
      return {
        context: {
          contentType: required(row.contentType) as TripDocumentContentType,
          fileName: required(row.fileName),
          kind: required(row.kind) as TripDocumentKind,
        },
        id: row.id,
        subtitle: joinSubtitle(row.kind, row.fileName),
        target: { tripId, type: "documents" },
        title: row.title,
        type: row.type,
      };
  }
}

function joinSubtitle(...parts: Array<string | null>): string {
  return parts.filter((part): part is string => Boolean(part)).join(" · ");
}

function required(value: string | null): string {
  if (value === null) {
    throw new Error("Search row is missing required context");
  }

  return value;
}
