import assert from "node:assert/strict";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";

// Always owns a NEW disposable stack. An explicit target is an acknowledgement,
// not permission to attach to another server or production data.
assert.equal(process.env.PORTFOLIO_BASE_URL, "http://127.0.0.1:3310", "Set PORTFOLIO_BASE_URL=http://127.0.0.1:3310 for the owned disposable fixture");
process.env.READINESS_RUN_LABEL ??= "stage32-portfolio";
process.env.PORTFOLIO_FIXTURE = "1";
const { root, startStack, resultsDir } = await import("../readiness/stack.mjs");
const require = createRequire(join(root, "package.json"));
const { chromium, expect } = require("@playwright/test");
const stack = await startStack();
let browser;
const shots = [];
try {
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: "en-US", timezoneId: "UTC", reducedMotion: "reduce" });
  const headers = { Origin: stack.webOrigin, "X-TripForge-Request": "1" };
  const api = async (method, path, data) => {
    const response = await context.request[method](`${stack.apiOrigin}/api${path}`, { headers, data });
    assert.ok(response.ok(), `Fixture ${method} ${path}: ${response.status()}`);
    return response.status() === 204 ? undefined : response.json();
  };
  const register = (displayName, email) => api("post", "/auth/register", { displayName, email, password: "Fictional portfolio fixture password" });
  const sam = (await register("Sam Rivera", "portfolio-sam@example.test")).user;
  const alex = (await register("Alex Morgan", "portfolio-alex@example.test")).user;
  const trip = await api("post", "/trips", { name: "Japan Autumn Trip", startsOn: "2027-11-08", endsOn: "2027-11-14" });
  await api("post", `/trips/${trip.id}/members`, { email: sam.email, role: "editor" });
  for (const name of ["Tokyo", "Kyoto", "Osaka"]) await api("post", `/trips/${trip.id}/destinations`, { name });
  const days = await api("get", `/trips/${trip.id}/days`);
  const destinations = await api("get", `/trips/${trip.id}/destinations`);
  for (let index = 0; index < days.length; index++) await api("patch", `/trips/${trip.id}/days/${days[index].id}`, { destinationId: destinations[index < 3 ? 0 : index < 6 ? 1 : 2].id });
  for (const [day, kind, title, startTime, endTime, notes] of [
    [0, "activity", "Explore Yanaka's little streets", "10:30", "12:00", "A relaxed first day. Keep time for a café stop."],
    [0, "food", "Lunch in Ueno", "12:30", "13:30", "Choose somewhere together when we arrive."],
    [0, "activity", "Sunset walk along the Sumida River", "16:00", "17:30", "Leave the evening flexible."],
    [1, "activity", "A morning of art in Roppongi", "10:00", "12:00", "Confirm exhibition times before travelling."],
    [3, "transport", "Train to Kyoto", "09:00", "11:30", "Reservation linked in the bookings section."],
    [3, "activity", "Walk through Higashiyama", "14:00", "16:30", "Explore at an unhurried pace."],
    [6, "food", "Osaka food walk", "18:00", "20:00", "Finish the trip with a shared dinner."],
  ]) await api("post", `/trips/${trip.id}/itinerary-items`, { dayId: days[day].id, kind, title, startTime, endTime, notes });
  for (const reservation of [
    { kind: "accommodation", title: "Tokyo garden guesthouse", startDate: "2027-11-08", endDate: "2027-11-11", locationName: "Tokyo", providerName: "Fictional booking", notes: "Illustrative reservation, not a real booking." },
    { kind: "transport", title: "Tokyo → Kyoto morning train", startDate: "2027-11-11", endDate: "2027-11-11", startTime: "09:00", endTime: "11:30", transport: { mode: "train", originName: "Tokyo", destinationName: "Kyoto", operatorName: "Fictional rail operator", serviceNumber: null } },
    { kind: "restaurant", title: "Shared dinner in Gion", startDate: "2027-11-12", startTime: "19:00", locationName: "Kyoto", notes: "Fictional example; verify availability separately." },
  ]) await api("post", `/trips/${trip.id}/reservations`, { status: "confirmed", ...reservation });
  for (const [title, category, amountMinor, paidByUserId, spentOn] of [["Tokyo guesthouse", "accommodation", 48000, alex.id, "2027-11-08"], ["Train tickets to Kyoto", "transport", 22000, sam.id, "2027-11-11"], ["Welcome dinner", "food", 8650, alex.id, "2027-11-08"]]) await api("post", `/trips/${trip.id}/expenses`, { title, category, currency: "JPY", amountMinor, paidByUserId, spentOn, split: { method: "equal", participantUserIds: [alex.id, sam.id] } });
  await api("post", "/trips", { name: "Coastal Weekend", startsOn: "2027-06-18", endsOn: "2027-06-20" });
  await api("post", "/trips", { name: "Alpine Spring Escape", startsOn: "2027-05-03", endsOn: "2027-05-08" });
  // Fixed fixture timestamps, not production clock changes. Avoid UUID/date noise.
  await stack.pool.query("UPDATE trips SET created_at=CASE name WHEN 'Japan Autumn Trip' THEN '2026-10-03T09:00:00Z'::timestamptz WHEN 'Coastal Weekend' THEN '2026-10-02T09:00:00Z'::timestamptz ELSE '2026-10-01T09:00:00Z'::timestamptz END, updated_at='2026-10-03T09:00:00Z'");
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date("2026-10-03T12:00:00Z"));
  await context.route("https://api.maptiler.com/**", (route) => route.abort());
  const output = join(root, "docs/assets/portfolio");
  await mkdir(output, { recursive: true });
  async function capture(name) {
    if (name !== "dashboard") await expect(page.getByText("Live", { exact: true })).toBeVisible({ timeout: 15_000 });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: join(output, `${name}.png`), animations: "disabled", caret: "hide", scale: "css" });
    const bytes = (await stat(join(output, `${name}.png`))).size;
    assert.ok(bytes < 1_000_000, "Curated screenshot must be under 1 MB");
    shots.push({ name, bytes, viewport: page.viewportSize() });
    console.log(`Captured ${name}: ${bytes} bytes`);
  }
  await page.goto(`${stack.webOrigin}/trips`);
  await expect(page.getByText("Japan Autumn Trip", { exact: true })).toBeVisible(); await capture("dashboard");
  await page.goto(`${stack.webOrigin}/trips/${trip.id}`);
  await expect(page.getByRole("heading", { name: "Explore Yanaka's little streets", exact: true })).toBeVisible(); await capture("itinerary");
  await page.goto(`${stack.webOrigin}/trips/${trip.id}/expenses`);
  await expect(page.getByText("Tokyo guesthouse", { exact: true })).toBeVisible(); await capture("expenses");
  await page.goto(`${stack.webOrigin}/trips/${trip.id}/reservations`);
  await expect(page.getByText("Tokyo → Kyoto morning train", { exact: true })).toBeVisible(); await capture("reservations");
  await page.goto(`${stack.webOrigin}/trips/${trip.id}/search`);
  await page.getByLabel("Search this trip").fill("Kyoto");
  await expect(page.getByRole("link", { name: /Tokyo → Kyoto morning train/ })).toBeVisible(); await capture("search");
  await page.goto(`${stack.webOrigin}/trips/${trip.id}/assistant`);
  await page.getByRole("button", { name: "New chat", exact: true }).first().click();
  await page.getByLabel("Message", { exact: true }).fill("Please suggest a quiet walking stop for our first Tokyo day.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByRole("button", { name: "Apply", exact: true }).last()).toBeEnabled();
  await expect(page.getByText(/Opening hours are not verified/)).toBeVisible(); await capture("assistant");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${stack.webOrigin}/trips/${trip.id}`);
  await expect(page.getByRole("heading", { name: "Explore Yanaka's little streets", exact: true })).toBeVisible();
  await page.getByRole("heading", { name: "Itinerary", exact: true }).evaluate((heading) => { heading.scrollIntoView({ block: "start" }); window.scrollBy(0, -96); });
  await capture("itinerary-mobile");
  await writeFile(join(resultsDir, "portfolio-captures.json"), JSON.stringify({ browser: browser.version(), fixture: "Fictional Japan Autumn Trip; two fictional accounts; deterministic provider-only AI", screenshots: shots }, null, 2));
  await context.close();
} finally { await browser?.close(); await stack.close(); }
