import { api, expect, mutate, test } from "./fixtures";

// A valid MVT polygon covering one tile; no live provider key or new dependency.
const vectorTile = Buffer.from("GiZ4AQoHYmFzZW1hcCiAIBIWCAESABgDIg4JAAAagEAAAIBA/z8ADw==", "base64");

test("production map worker loads its sibling and requests vector tiles beneath markers", async ({ page, context, trip }) => {
  const workerErrors: string[] = [];
  const workers: string[] = [];
  const tileResponses: number[] = [];
  page.on("pageerror", (error) => workerErrors.push(error.message));
  page.on("worker", (worker) => workers.push(worker.url()));
  context.on("response", (response) => {
    if (new URL(response.url()).pathname.endsWith(".pbf")) tileResponses.push(response.status());
  });
  await context.route("https://api.maptiler.com/maps/**", (route) => route.fulfill({ json: {
    version: 8,
    sources: { basemap: { type: "vector", url: "https://api.maptiler.com/tiles/v3/tiles.json?key=readiness-provider-boundary" } },
    layers: [{ id: "basemap-fill", type: "fill", source: "basemap", "source-layer": "basemap", paint: { "fill-color": "#059669" } }],
  } }));
  await context.route("https://api.maptiler.com/tiles/v3/tiles.json*", (route) => route.fulfill({ json: {
    tilejson: "3.0.0", minzoom: 0, maxzoom: 14,
    tiles: ["https://api.maptiler.com/tiles/v3/{z}/{x}/{y}.pbf?key=readiness-provider-boundary"],
    vector_layers: [{ id: "basemap", fields: {} }],
  } }));
  await context.route("https://api.maptiler.com/tiles/v3/**/*.pbf*", (route) => route.fulfill({
    body: vectorTile, contentType: "application/x-protobuf",
  }));

  const destination = await mutate(context, "post", `/trips/${trip.id}/destinations`, { name: "Tokyo worker test" });
  await mutate(context, "patch", `/trips/${trip.id}/destinations/${destination.id}`, { latitude: 35.6762, longitude: 139.6503 });
  const days = await (await context.request.get(`${api}/api/trips/${trip.id}/days`)).json();
  await mutate(context, "post", `/trips/${trip.id}/itinerary-items`, {
    dayId: days[0].id, title: "Worker museum", kind: "activity",
    place: { name: "Worker museum", provider: "maptiler", latitude: 35.6862, longitude: 139.6603 },
  });

  const response = await page.goto(`/trips/${trip.id}`);
  const policy = response!.headers()["content-security-policy"]!;
  expect(policy.split(";").map((part) => part.trim()).find((part) => part.startsWith("worker-src ")))
    .toBe("worker-src 'self' blob:");
  await expect.poll(() => workers.length).toBeGreaterThan(0);
  for (const url of workers) {
    expect(new URL(url).origin).toBe(api);
    expect(new URL(url).pathname).toMatch(/^\/maplibre\/6\.10\.0\/maplibre-gl-worker\.mjs$/);
  }
  const workerUrl = workers[0]!;
  for (const url of [workerUrl, new URL("maplibre-gl-shared.mjs", workerUrl).href]) {
    const asset = await context.request.get(url);
    expect(asset.status()).toBe(200);
    expect(asset.headers()["content-type"]).toMatch(/(?:java|ecma)script/);
  }
  await expect.poll(() => tileResponses.length).toBeGreaterThan(0);
  expect(tileResponses.every((status) => status === 200)).toBe(true);
  await expect(page.getByRole("button", { name: "Select Tokyo worker test on map", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Select Worker museum on map", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Select Worker museum on map", exact: true }).click();
  await expect(page.locator(".maplibregl-popup")).toContainText("Worker museum");
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  const canvas = page.locator("canvas.maplibregl-canvas");
  const bounds = (await canvas.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 50, bounds.y + bounds.height / 2 + 20, { steps: 10 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Show all places", exact: true }).click();

  // Network/DOM markers alone missed this regression: require rendered MVT pixels.
  await expect.poll(async () => {
    const png = await canvas.screenshot();
    return await page.evaluate(async (base64) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const sample = document.createElement("canvas");
      sample.width = image.width;
      sample.height = image.height;
      const context = sample.getContext("2d")!;
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
      let basemapPixels = 0;
      for (let offset = 0; offset < pixels.length; offset += 4) {
        if (Math.abs(pixels[offset]! - 5) < 5 && Math.abs(pixels[offset + 1]! - 150) < 5 && Math.abs(pixels[offset + 2]! - 105) < 5) basemapPixels++;
      }
      return basemapPixels / (sample.width * sample.height);
    }, png.toString("base64"));
  }).toBeGreaterThan(0.25);

  const beforeReload = tileResponses.length;
  await page.reload();
  await expect.poll(() => tileResponses.length).toBeGreaterThan(beforeReload);
  await expect(page.getByRole("button", { name: "Select Tokyo worker test on map", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Select Worker museum on map", exact: true })).toBeVisible();
  expect(workerErrors).toEqual([]);
  expect(tileResponses.every((status) => status === 200)).toBe(true);
});
