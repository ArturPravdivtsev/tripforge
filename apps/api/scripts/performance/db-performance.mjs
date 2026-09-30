import { Buffer } from "node:buffer";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import process from "node:process";

import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

if (process.env.NODE_ENV === "production") {
  throw new Error("The performance fixture is disabled in production");
}

const PROFILES = [
  {
    days: 21,
    destinations: 8,
    documents: 80,
    expenses: 240,
    itineraryItemsPerDay: 8,
    key: "typical",
    members: 6,
    reservations: 48,
    routes: 32,
  },
  {
    days: 365,
    destinations: 50,
    documents: 500,
    expenses: 3000,
    itineraryItemsPerDay: 10,
    key: "stress",
    members: 12,
    reservations: 600,
    routes: 400,
  },
];

const container = await new PostgreSqlContainer("postgres:18.6-bookworm")
  .withDatabase("tripforge_performance")
  .withUsername("tripforge")
  .withPassword("tripforge")
  .start();
const pool = new Pool({ connectionString: container.getConnectionUri(), max: 4 });

try {
  await migrate(drizzle(pool), {
    migrationsFolder: resolve(import.meta.dirname, "../../drizzle"),
  });
  await seedFixture(pool);
  await pool.query("ANALYZE");

  const validation = await validateFixture(pool);
  const measurements = [];
  for (const query of representativeQueries()) {
    measurements.push(await measureQuery(pool, query));
  }

  const postgresVersion = await pool.query("show server_version");
  const report = {
    environment: {
      architecture: process.arch,
      node: process.version,
      platform: process.platform,
      postgres: postgresVersion.rows[0]?.server_version,
      samples: 7,
      warmups: 2,
    },
    fixture: validation,
    measurements,
    note: "Timings are diagnostic local measurements, not CI pass/fail thresholds.",
  };

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} finally {
  await pool.end();
  await container.stop();
}

async function seedFixture(database) {
  await database.query("BEGIN");
  try {
    await database.query(`
      insert into users (id, email, display_name, created_at, updated_at)
      select
        md5('perf-user-' || value)::uuid,
        'perf-user-' || value || '@example.test',
        'Performance User ' || value,
        timestamptz '2026-01-01 00:00:00+00' + value * interval '1 minute',
        timestamptz '2026-01-01 00:00:00+00' + value * interval '1 minute'
      from generate_series(1, 16) value
    `);

    for (const profile of PROFILES) {
      await seedProfile(database, profile);
    }

    await database.query(`
      insert into user_notifications (
        id, user_id, type, trip_id, trip_name_snapshot, actor_user_id,
        actor_name_snapshot, payload, read_at, created_at
      )
      select
        md5('perf-notification-' || value)::uuid,
        md5('perf-user-' || (2 + ((value - 1) % 3)))::uuid,
        case when value % 2 = 0 then 'expense_added' else 'reservation_added' end::user_notification_type,
        md5(case when value % 2 = 0 then 'perf-trip-stress' else 'perf-trip-typical' end)::uuid,
        case when value % 2 = 0 then 'Stress trip' else 'Typical trip' end,
        md5('perf-user-1')::uuid,
        'Performance User 1',
        jsonb_build_object('fixtureSequence', value),
        case when value % 3 = 0 then timestamptz '2026-02-01 00:00:00+00' else null end,
        timestamptz '2026-02-01 00:00:00+00' + value * interval '1 second'
      from generate_series(1, 4500) value
    `);

    await database.query(`
      insert into storage_cleanup_outbox (id, storage_key, reason, created_at)
      select
        md5('perf-outbox-' || value)::uuid,
        'performance/pending/' || value,
        'stale_pending',
        timestamptz '2026-03-01 00:00:00+00' + value * interval '1 second'
      from generate_series(1, 2000) value
    `);
    await database.query("COMMIT");
  } catch (error) {
    await database.query("ROLLBACK");
    throw error;
  }
}

async function seedProfile(database, profile) {
  const itemCount = profile.days * profile.itineraryItemsPerDay;
  const endOffset = profile.days - 1;
  await database.query(
    `insert into trips (id, owner_id, name, starts_on, ends_on, created_at, updated_at)
     values (
       md5('perf-trip-' || $1)::uuid,
       md5('perf-user-1')::uuid,
       initcap($1) || ' trip',
       date '2026-01-01',
       date '2026-01-01' + $2::integer,
       timestamptz '2026-01-01 00:00:00+00',
       timestamptz '2026-01-01 00:00:00+00'
     )`,
    [profile.key, endOffset],
  );
  await database.query(
    `insert into trip_members (trip_id, user_id, role, created_at, updated_at)
     select
       md5('perf-trip-' || $1)::uuid,
       md5('perf-user-' || value)::uuid,
       case when value % 2 = 0 then 'editor' else 'viewer' end::trip_member_role,
       timestamptz '2026-01-01 00:00:00+00',
       timestamptz '2026-01-01 00:00:00+00'
     from generate_series(2, $2 + 1) value`,
    [profile.key, profile.members],
  );
  await database.query(
    `insert into trip_destinations (
       id, trip_id, name, latitude, longitude, position, created_at, updated_at
     )
     select
       md5('perf-destination-' || $1 || '-' || value)::uuid,
       md5('perf-trip-' || $1)::uuid,
       'Museum destination ' || value,
       40 + value::double precision / 100,
       -73 - value::double precision / 100,
       value - 1,
       timestamptz '2026-01-01 00:00:00+00',
       timestamptz '2026-01-01 00:00:00+00'
     from generate_series(1, $2) value`,
    [profile.key, profile.destinations],
  );
  await database.query(
    `insert into trip_days (id, trip_id, date, destination_id, created_at, updated_at)
     select
       md5('perf-day-' || $1 || '-' || value)::uuid,
       md5('perf-trip-' || $1)::uuid,
       date '2026-01-01' + value - 1,
       md5('perf-destination-' || $1 || '-' || (((value - 1) % $3) + 1))::uuid,
       timestamptz '2026-01-01 00:00:00+00',
       timestamptz '2026-01-01 00:00:00+00'
     from generate_series(1, $2) value`,
    [profile.key, profile.days, profile.destinations],
  );
  await database.query(
    `insert into itinerary_items (
       id, trip_day_id, kind, title, start_time, notes, place_name, place_address,
       place_latitude, place_longitude, place_provider, place_provider_ref,
       position, created_at, updated_at
     )
     select
       md5('perf-item-' || $1 || '-' || day_value || '-' || item_value)::uuid,
       md5('perf-day-' || $1 || '-' || day_value)::uuid,
       case when item_value % 3 = 0 then 'food' else 'activity' end::itinerary_item_kind,
       case
         when (((day_value - 1) * $3 + item_value) % 97) = 0
           then 'Museum itinerary ' || day_value || '-' || item_value
         else 'Fixture itinerary ' || day_value || '-' || item_value
       end,
       time '08:00:00' + item_value * interval '1 hour',
       'Deterministic performance fixture',
       'Fixture place ' || item_value,
       item_value || ' Fixture Street',
       40 + day_value::double precision / 1000,
       -73 - item_value::double precision / 1000,
       'maptiler',
       'fixture.' || $1 || '.' || day_value || '.' || item_value,
       item_value - 1,
       timestamptz '2026-01-01 00:00:00+00',
       timestamptz '2026-01-01 00:00:00+00'
     from generate_series(1, $2) day_value
     cross join generate_series(1, $3) item_value`,
    [profile.key, profile.days, profile.itineraryItemsPerDay],
  );
  await database.query(
    `insert into trip_route_segments (
       id, trip_id, from_item_id, to_item_id, mode, distance_meters,
       duration_seconds, geometry, origin_latitude, origin_longitude,
       destination_latitude, destination_longitude, provider, created_at, updated_at
     )
     select
       md5('perf-route-' || $1 || '-' || value)::uuid,
       md5('perf-trip-' || $1)::uuid,
       md5('perf-item-' || $1 || '-' || (((value - 1) / $3) + 1) || '-' || (((value - 1) % $3) + 1))::uuid,
       md5('perf-item-' || $1 || '-' || ((value / $3) + 1) || '-' || ((value % $3) + 1))::uuid,
       case when value % 2 = 0 then 'walking' else 'driving' end::trip_route_mode,
       500 + value,
       300 + value,
       jsonb_build_object('type', 'LineString', 'coordinates', jsonb_build_array(jsonb_build_array(-73, 40), jsonb_build_array(-73.1, 40.1))),
       40, -73, 40.1, -73.1, 'openrouteservice',
       timestamptz '2026-01-01 00:00:00+00',
       timestamptz '2026-01-01 00:00:00+00'
     from generate_series(1, least($2, $4 - 1)) value`,
    [profile.key, profile.routes, profile.itineraryItemsPerDay, itemCount],
  );
  await database.query(
    `insert into trip_reservations (
       id, trip_id, kind, status, title, provider_name, confirmation_code,
       start_date, start_time, end_date, end_time, location_name, notes,
       created_at, updated_at
     )
     select
       md5('perf-reservation-' || $1 || '-' || value)::uuid,
       md5('perf-trip-' || $1)::uuid,
       case when value % 2 = 0 then 'transport' else 'activity' end::trip_reservation_kind,
       'confirmed',
       'Museum reservation ' || value,
       'Fixture Provider', 'CONF-' || value,
       date '2026-01-01' + ((value - 1) % $3), time '09:00:00',
       date '2026-01-01' + ((value - 1) % $3), time '10:00:00',
       'Fixture location', 'Deterministic performance fixture',
       timestamptz '2026-01-01 00:00:00+00' + value * interval '1 second',
       timestamptz '2026-01-01 00:00:00+00' + value * interval '1 second'
     from generate_series(1, $2) value`,
    [profile.key, profile.reservations, profile.days],
  );
  await database.query(
    `insert into reservation_transport_details (
       reservation_id, mode, operator_name, service_number, origin_name, destination_name
     )
     select
       md5('perf-reservation-' || $1 || '-' || value)::uuid,
       'train', 'Fixture Rail', 'TF-' || value, 'Origin', 'Destination'
     from generate_series(2, $2, 2) value`,
    [profile.key, profile.reservations],
  );
  await database.query(
    `insert into trip_expenses (
       id, trip_id, title, category, spent_on, currency, amount_minor,
       paid_by_user_id, split_method, notes, created_at, updated_at
     )
     select
       md5('perf-expense-' || $1 || '-' || value)::uuid,
       md5('perf-trip-' || $1)::uuid,
       'Museum expense ' || value,
       case when value % 2 = 0 then 'transport' else 'activity' end::trip_expense_category,
       date '2026-01-01' + ((value - 1) % $3), 'USD', 10000,
       md5('perf-user-' || (((value - 1) % 4) + 1))::uuid,
       'equal', 'Deterministic performance fixture',
       timestamptz '2026-01-01 00:00:00+00' + value * interval '1 second',
       timestamptz '2026-01-01 00:00:00+00' + value * interval '1 second'
     from generate_series(1, $2) value`,
    [profile.key, profile.expenses, profile.days],
  );
  await database.query(
    `insert into trip_expense_splits (expense_id, user_id, amount_minor, created_at, updated_at)
     select
       md5('perf-expense-' || $1 || '-' || expense_value)::uuid,
       md5('perf-user-' || user_value)::uuid,
       2500,
       timestamptz '2026-01-01 00:00:00+00',
       timestamptz '2026-01-01 00:00:00+00'
     from generate_series(1, $2) expense_value
     cross join generate_series(1, 4) user_value`,
    [profile.key, profile.expenses],
  );
  await database.query(
    `insert into trip_documents (
       id, trip_id, kind, status, title, original_file_name, content_type,
       size_bytes, storage_key, etag, uploaded_by_user_id, created_at, updated_at, ready_at
     )
     select
       md5('perf-document-' || $1 || '-' || value)::uuid,
       md5('perf-trip-' || $1)::uuid,
       'other', 'ready', 'Museum document ' || value,
       'fixture-' || value || '.pdf', 'application/pdf', 4096,
       'performance/' || $1 || '/' || value || '.pdf', 'fixture-etag',
       md5('perf-user-1')::uuid,
       timestamptz '2026-01-01 00:00:00+00' + value * interval '1 second',
       timestamptz '2026-01-01 00:00:00+00' + value * interval '1 second',
       timestamptz '2026-01-01 00:00:00+00' + value * interval '1 second'
     from generate_series(1, $2) value`,
    [profile.key, profile.documents],
  );
}

async function validateFixture(database) {
  const result = await database.query(`
    select
      t.name as profile,
      (select count(*)::integer from trip_members m where m.trip_id = t.id) as members,
      (select count(*)::integer from trip_destinations d where d.trip_id = t.id) as destinations,
      (select count(*)::integer from trip_days d where d.trip_id = t.id) as days,
      (select count(*)::integer from itinerary_items i join trip_days d on d.id = i.trip_day_id where d.trip_id = t.id) as itinerary_items,
      (select count(*)::integer from trip_route_segments r where r.trip_id = t.id) as routes,
      (select count(*)::integer from trip_reservations r where r.trip_id = t.id) as reservations,
      (select count(*)::integer from trip_expenses e where e.trip_id = t.id) as expenses,
      (select count(*)::integer from trip_documents d where d.trip_id = t.id) as documents
    from trips t
    order by t.name
  `);
  const notifications = await database.query(
    "select count(*)::integer as count from user_notifications",
  );
  const profiles = Object.fromEntries(
    result.rows.map((row) => [row.profile.toLowerCase().replace(" trip", ""), row]),
  );

  for (const expected of PROFILES) {
    const actual = profiles[expected.key];
    const expectedCounts = {
      days: expected.days,
      destinations: expected.destinations,
      documents: expected.documents,
      expenses: expected.expenses,
      itinerary_items: expected.days * expected.itineraryItemsPerDay,
      members: expected.members,
      reservations: expected.reservations,
      routes: expected.routes,
    };
    for (const [name, count] of Object.entries(expectedCounts)) {
      if (actual?.[name] !== count) {
        throw new Error(`${expected.key}.${name}: expected ${count}, got ${String(actual?.[name])}`);
      }
    }
  }
  if (notifications.rows[0]?.count !== 4500) {
    throw new Error("Expected exactly 4500 notifications");
  }

  const invariantsResult = await database.query(`
    select
      not exists (
        select 1 from trip_days d
        join trip_destinations destination on destination.id = d.destination_id
        where destination.trip_id <> d.trip_id
      ) as day_destinations_belong_to_trip,
      not exists (
        select 1 from trip_route_segments route
        join itinerary_items source on source.id = route.from_item_id
        join trip_days source_day on source_day.id = source.trip_day_id
        join itinerary_items target on target.id = route.to_item_id
        join trip_days target_day on target_day.id = target.trip_day_id
        where source_day.trip_id <> route.trip_id or target_day.trip_id <> route.trip_id
      ) as route_items_belong_to_trip,
      not exists (
        select 1 from trip_expenses expense
        join trip_expense_splits split on split.expense_id = expense.id
        group by expense.id, expense.amount_minor
        having sum(split.amount_minor) <> expense.amount_minor
      ) as expense_splits_balance,
      not exists (
        select 1 from reservation_transport_details detail
        join trip_reservations reservation on reservation.id = detail.reservation_id
        where reservation.kind <> 'transport'
      ) as transport_details_match_kind,
      not exists (
        select 1 from trip_documents where status = 'ready' and ready_at is null
      ) as ready_documents_have_timestamp
  `);
  const invariants = invariantsResult.rows[0];
  if (!invariants || Object.values(invariants).some((value) => value !== true)) {
    throw new Error(`Fixture invariant failed: ${JSON.stringify(invariants)}`);
  }

  return {
    invariants,
    notificationsPerProfiledUser: 1500,
    notificationsTotal: 4500,
    profiles,
  };
}

function representativeQueries() {
  const stressTrip = "md5('perf-trip-stress')::uuid";
  const notificationUser = "md5('perf-user-2')::uuid";
  return [
    query("trips-list", `select t.*, case when t.owner_id = ${notificationUser} then 'owner' else m.role::text end as access_role from trips t left join trip_members m on m.trip_id = t.id and m.user_id = ${notificationUser} where t.owner_id = ${notificationUser} or m.user_id is not null order by t.created_at desc, t.id desc limit 20`),
    query("trip-detail", `select t.*, case when t.owner_id = ${notificationUser} then 'owner' else m.role::text end as access_role from trips t left join trip_members m on m.trip_id = t.id and m.user_id = ${notificationUser} where t.id = ${stressTrip} and (t.owner_id = ${notificationUser} or m.user_id is not null) limit 1`),
    query("members", `select m.*, u.email, u.display_name from trip_members m join users u on u.id = m.user_id where m.trip_id = ${stressTrip} order by m.created_at, m.user_id`),
    query("destinations", `select * from trip_destinations where trip_id = ${stressTrip} order by position, id`),
    query("trip-days", `select * from trip_days where trip_id = ${stressTrip} order by date`),
    query("itinerary", `select i.* from itinerary_items i join trip_days d on d.id = i.trip_day_id where d.trip_id = ${stressTrip} order by d.date, i.position, i.id`),
    query("routes", `select * from trip_route_segments where trip_id = ${stressTrip} order by created_at, id`),
    query("reservations", `select r.*, td.mode, td.service_number from trip_reservations r left join reservation_transport_details td on td.reservation_id = r.id where r.trip_id = ${stressTrip} order by r.start_date, r.start_time, r.created_at, r.id`),
    query("expenses", `select e.*, count(s.user_id)::integer as split_count from trip_expenses e left join trip_expense_splits s on s.expense_id = e.id where e.trip_id = ${stressTrip} group by e.id order by e.spent_on desc, e.created_at desc, e.id desc`),
    query("expense-balances", `select s.user_id, sum(s.amount_minor)::bigint as owed_minor, sum(e.amount_minor) filter (where e.paid_by_user_id = s.user_id)::bigint as paid_minor from trip_expenses e join trip_expense_splits s on s.expense_id = e.id where e.trip_id = ${stressTrip} group by s.user_id order by s.user_id`),
    query("documents", `select * from trip_documents where trip_id = ${stressTrip} and status = 'ready' order by created_at desc, id desc`),
    query("notifications-page", `select * from user_notifications where user_id = ${notificationUser} order by created_at desc, id desc limit 50`),
    query("notifications-keyset-page", `select * from user_notifications where user_id = ${notificationUser} and (created_at, id) < (timestamptz '2026-02-01 01:12:31+00', md5('perf-notification-4351')::uuid) order by created_at desc, id desc limit 50`),
    query("notifications-unread", `select count(*)::integer from user_notifications where user_id = ${notificationUser} and read_at is null`),
    query("notifications-target-access", `select t.id from trips t left join trip_members m on m.trip_id = t.id and m.user_id = ${notificationUser} where t.id = any(array[md5('perf-trip-stress')::uuid, md5('perf-trip-typical')::uuid]) and (t.owner_id = ${notificationUser} or m.user_id is not null)`),
    query("search", `select i.id, i.title, ts_rank_cd(i.search_vector, websearch_to_tsquery('simple'::regconfig, 'museum'), 32) as relevance from itinerary_items i join trip_days d on d.id = i.trip_day_id where d.trip_id = ${stressTrip} and i.search_vector @@ websearch_to_tsquery('simple'::regconfig, 'museum') order by relevance desc, i.id limit 50`),
    query("cleanup-outbox", `select id, storage_key from storage_cleanup_outbox where completed_at is null order by created_at, id limit 100 for update skip locked`),
  ];
}

function query(name, sql) {
  return { name, sql };
}

async function measureQuery(database, queryDefinition) {
  for (let index = 0; index < 2; index += 1) {
    await database.query(queryDefinition.sql);
  }
  const samples = [];
  let latestResult;
  for (let index = 0; index < 7; index += 1) {
    const startedAt = performance.now();
    latestResult = await database.query(queryDefinition.sql);
    samples.push(performance.now() - startedAt);
  }
  samples.sort((left, right) => left - right);
  const explained = await database.query(
    `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${queryDefinition.sql}`,
  );
  const explanation = explained.rows[0]?.["QUERY PLAN"]?.[0];

  return {
    name: queryDefinition.name,
    responseBytes: Buffer.byteLength(JSON.stringify(latestResult?.rows ?? [])),
    rows: latestResult?.rowCount ?? 0,
    timingMs: {
      max: round(samples.at(-1)),
      median: round(samples[Math.floor(samples.length / 2)]),
      min: round(samples[0]),
    },
    plan: summarizePlan(explanation),
  };
}

function summarizePlan(explanation) {
  const nodeTypes = new Set();
  const indexes = new Set();
  const operators = [];
  let sharedHitBlocks = 0;
  let sharedReadBlocks = 0;

  function visit(node) {
    if (!node) return;
    if (node["Node Type"]) nodeTypes.add(node["Node Type"]);
    if (node["Index Name"]) indexes.add(node["Index Name"]);
    operators.push({
      actualLoops: node["Actual Loops"],
      actualRows: node["Actual Rows"],
      estimatedRows: node["Plan Rows"],
      index: node["Index Name"],
      node: node["Node Type"],
      relation: node["Relation Name"],
      sortMethod: node["Sort Method"],
      sortSpaceType: node["Sort Space Type"],
    });
    sharedHitBlocks += node["Shared Hit Blocks"] ?? 0;
    sharedReadBlocks += node["Shared Read Blocks"] ?? 0;
    for (const child of node.Plans ?? []) visit(child);
  }
  visit(explanation?.Plan);

  return {
    executionMs: round(explanation?.["Execution Time"]),
    indexes: [...indexes].sort(),
    nodeTypes: [...nodeTypes].sort(),
    operators,
    planningMs: round(explanation?.["Planning Time"]),
    sharedHitBlocks,
    sharedReadBlocks,
  };
}

function round(value) {
  return typeof value === "number" ? Math.round(value * 1000) / 1000 : null;
}
