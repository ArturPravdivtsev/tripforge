import assert from "node:assert/strict";
import { test } from "node:test";

import { parseClientReferenceManifest } from "./bundle-metrics.mjs";

test("parses a Next client reference manifest assignment", () => {
  const manifest = parseClientReferenceManifest(
    'globalThis.__RSC_MANIFEST={};globalThis.__RSC_MANIFEST["/trips/page"]={"clientModules":{}};',
  );

  assert.deepEqual(manifest, { clientModules: {} });
});

test("rejects content without an assignment", () => {
  assert.throws(
    () => parseClientReferenceManifest("not a manifest"),
    /Invalid client reference manifest/,
  );
});
