import assert from "node:assert/strict";
import test from "node:test";
import { assertLocalTarget, assertProfile, destructiveStatements } from "./safety.mjs";

test("qualification cannot mutate a remote target or ambiguous origin", () => {
  assert.equal(assertLocalTarget("http://127.0.0.1:4410"), "http://127.0.0.1:4410");
  for (const target of ["https://api.example.com", "http://127.0.0.1.evil.test", "http://user:secret@localhost", "http://localhost/api", "http://localhost?token=secret", "http://localhost#other", "file:///tmp/api"]) assert.throws(() => assertLocalTarget(target));
});
test("load profiles bound resource use and validate overrides", () => {
  assertProfile("load", "10m", "25");
  for (const values of [["unknown"], ["constructor"], ["__proto__"], ["load", "-1m"], ["load", "61m"], ["load", "10m", "101"], ["load", "10m", "1.1"]]) assert.throws(() => assertProfile(...values));
});
test("migration review blocks destructive changes while ignoring comments", () => {
  assert.equal(destructiveStatements('ALTER TABLE trips ADD COLUMN note text; -- DROP TABLE trips;').length, 0);
  for (const sql of ['DROP TABLE "trips";', 'ALTER TABLE trips DROP COLUMN name;', 'TRUNCATE trips;', 'DELETE FROM trips;', 'ALTER TABLE trips ALTER COLUMN name TYPE integer;', 'ALTER TABLE trips ALTER COLUMN name SET NOT NULL;', 'ALTER TABLE trips RENAME TO old_trips;', "DO $$ BEGIN EXECUTE 'DROP TABLE trips'; END $$;"]) assert.ok(destructiveStatements(sql).length > 0, sql);
});
