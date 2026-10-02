import { randomUUID } from "node:crypto";
import { assertLocalTarget } from "./safety.mjs";

export async function identity(origin, suffix = randomUUID()) {
  assertLocalTarget(origin);
  const response = await fetch(`${origin}/api/auth/register`, {
    method: "POST", headers: { Origin: "http://127.0.0.1:3310", "X-TripForge-Request": "1", "Content-Type": "application/json" },
    body: JSON.stringify({ email: `stage31-${suffix}@example.test`, displayName: `Stage31 ${suffix}`, password: "Stage31 isolated qualification password" }),
  });
  if (response.status !== 201) throw new Error(`Fixture registration failed: ${response.status}`);
  const cookie = response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
  const user = (await response.json()).user;
  return { cookie, userId: user.id, email: user.email };
}

export async function request(origin, session, path, method = "GET", body) {
  assertLocalTarget(origin);
  const response = await fetch(`${origin}${path}`, { method, headers: { Cookie: session.cookie, Origin: "http://127.0.0.1:3310", "X-TripForge-Request": "1", "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error(`Qualification ${method} ${path}: ${response.status} ${await response.text()}`);
  return response.status === 204 ? undefined : await response.json();
}

export async function seedLoad(stack, count = 20) {
  // Stage25 typical-fixture concepts: 21 days, 8 items/day, bounded financial,
  // reservation/document metadata, generated search vectors. No providers/files.
  const sessions = [];
  for (let index = 0; index < count; index++) {
    const session = await identity(stack.apiOrigin);
    const trip = await request(stack.apiOrigin, session, "/api/trips", "POST", { name: `Stage31 Load ${index}`, startsOn: "2027-04-01", endsOn: "2027-04-21" });
    sessions.push({ ...session, tripId: trip.id });
    await stack.pool.query(`INSERT INTO itinerary_items (trip_day_id, kind, title, position)
      SELECT d.id, 'activity', 'Museum activity ' || n, n - 1 FROM trip_days d CROSS JOIN generate_series(1,8) n WHERE d.trip_id=$1`, [trip.id]);
    await stack.pool.query(`INSERT INTO trip_reservations (trip_id, kind, status, title, start_date)
      SELECT $1, 'activity', 'confirmed', 'Museum reservation ' || n, date '2027-04-01' + ((n-1)%21) FROM generate_series(1,24) n`, [trip.id]);
    await stack.pool.query(`INSERT INTO trip_expenses (trip_id, title, category, spent_on, currency, amount_minor, paid_by_user_id, split_method)
      SELECT $1, 'Museum expense ' || n, 'activity', date '2027-04-01' + ((n-1)%21), 'USD', 12345, $2, 'equal' FROM generate_series(1,48) n`, [trip.id, session.userId]);
    await stack.pool.query(`INSERT INTO trip_expense_splits (expense_id, user_id, amount_minor)
      SELECT id, $2, amount_minor FROM trip_expenses WHERE trip_id=$1`, [trip.id, session.userId]);
    await stack.pool.query(`INSERT INTO trip_documents (id, trip_id, kind, status, title, original_file_name, content_type, size_bytes, storage_key, uploaded_by_user_id, ready_at)
      SELECT gen_random_uuid(), $1::uuid, 'ticket', 'ready', 'Museum ticket ' || n, 'ticket.pdf', 'application/pdf', 64, 'stage31/metadata/' || $1::uuid::text || '/' || n, $2, now() FROM generate_series(1,16) n`, [trip.id, session.userId]);
    await stack.pool.query(`INSERT INTO user_notifications (user_id, type, trip_id, trip_name_snapshot, actor_name_snapshot, payload)
      SELECT $1, 'reservation_added', $2, 'Stage31 Load', 'Fixture traveler', jsonb_build_object('type', 'reservation_added', 'data', jsonb_build_object('title', 'Museum reservation ' || n)) FROM generate_series(1,20) n`, [session.userId, trip.id]);
  }
  await stack.pool.query("ANALYZE");
  return { sessions, dataset: { users: count, trips: count, days: count * 21, items: count * 168, reservations: count * 24, expenses: count * 48, documents: count * 16, notifications: count * 20 } };
}
