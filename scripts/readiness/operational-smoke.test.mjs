import assert from "node:assert/strict";
import test from "node:test";
import { disposableCredentials, smokeOrigin } from "./operational-smoke.mjs";

test("operational smoke accepts explicit TLS or loopback, not credentials/paths/remote plaintext", () => {
  assert.equal(smokeOrigin("https://api.example.test"), "https://api.example.test");
  assert.equal(smokeOrigin("http://127.0.0.1:4410"), "http://127.0.0.1:4410");
  for (const value of ["http://api.example.test", "https://user:password@example.test", "https://example.test/api", "https://example.test?token=secret"]) assert.throws(() => smokeOrigin(value));
});

test("operational smoke mutation requires explicit matching disposable credentials", () => {
  const valid = { SMOKE_DISPOSABLE_ACK: "1", SMOKE_DISPOSABLE_PREFIX: "stage31-smoke-qualification", SMOKE_EMAIL: "stage31-smoke-qualification@example.test", SMOKE_PASSWORD: "A long disposable test password" };
  assert.equal(disposableCredentials(valid).prefix, "stage31-smoke-qualification");
  for (const change of [{ SMOKE_DISPOSABLE_ACK: undefined }, { SMOKE_DISPOSABLE_PREFIX: "real-user" }, { SMOKE_EMAIL: "real-user@example.test" }, { SMOKE_PASSWORD: "short" }]) assert.throws(() => disposableCredentials({ ...valid, ...change }));
});
