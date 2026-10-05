import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import AxeBuilder from "@axe-core/playwright";
import { api, expect, mutationHeaders, mutate, openTrip, password, register, test } from "./fixtures";

test("register, reload, logout, Back and login preserve HttpOnly isolation", async ({ page, context }) => {
  const email = `browser-auth-${randomUUID()}@example.com`;
  await page.goto("/register");
  await page.getByLabel("Display name").fill("Browser qualifier");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByRole("button", { name: "Logout", exact: true })).toBeVisible();
  const cookie = (await context.cookies(api)).find(({ name }) => name.includes("session"));
  expect(cookie?.httpOnly).toBe(true);
  expect(await page.evaluate(() => document.cookie)).not.toContain("session");
  await page.reload();
  await expect(page.getByRole("button", { name: "Logout", exact: true })).toBeVisible();
  await page.goto("/trips");
  await page.getByRole("button", { name: "Logout", exact: true }).click();
  await page.goBack();
  expect((await context.request.get(`${api}/api/auth/me`)).status()).toBe(401);
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("button", { name: "Logout", exact: true })).toBeVisible();
});

test("create/open/edit trip through real browser forms", async ({ page, context, identity }) => {
  void identity;
  const name = `Lifecycle ${randomUUID().slice(0, 8)}`;
  await page.goto("/trips/new");
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel("Start date").fill("2027-04-12");
  await page.getByLabel("End date").fill("2027-04-13");
  await page.getByRole("button", { name: "Create trip", exact: true }).click();
  await page.getByRole("link", { name: `Open ${name}`, exact: true }).click();
  await expect(page).toHaveURL(/\/trips\/[a-f0-9-]+$/);
  const id = page.url().split("/").at(-1)!;
  try {
    await page.getByRole("link", { name: "Edit", exact: true }).click();
    await page.getByLabel("Name", { exact: true }).fill(`${name} edited`);
    await page.getByRole("button", { name: "Save trip", exact: true }).click();
    await expect(page.getByRole("heading", { name: `${name} edited`, exact: true })).toBeVisible();
    await page.goto("/trips");
    await expect(page.getByRole("link", { name: `Open ${name} edited`, exact: true })).toBeVisible();
  } finally { await mutate(context, "delete", `/trips/${id}`); }
});

test("two-user RBAC, role changes, notifications and live revocation", async ({ page, context, browser, trip }) => {
  const other = await browser.newContext();
  try {
    const viewer = await register(other);
    const remote = await other.newPage();
    const tab = await other.newPage();
    await remote.goto("/notifications");
    await tab.goto("/notifications");
    await page.goto(`/trips/${trip.id}/members`);
    await page.getByLabel("Account email").fill(viewer.email);
    await page.getByLabel("Role", { exact: true }).selectOption("viewer");
    await page.getByRole("button", { name: "Add member", exact: true }).click();
    await expect(page.getByText(viewer.email, { exact: true }).first()).toBeVisible();
    await expect(remote.getByText(/shared.*with you/i).first()).toBeVisible({ timeout: 25_000 });
    await expect(remote.getByRole("link", { name: /Notifications, [1-9]\d* unread/i })).toBeVisible();
    await openTrip(remote, trip.id);
    await expect(remote.getByRole("link", { name: "Edit", exact: true })).toHaveCount(0);
    const forbidden = await other.request.patch(`${api}/api/trips/${trip.id}`, { headers: mutationHeaders, data: { name: "Unauthorized" } });
    expect(forbidden.status()).toBe(403);
    await page.getByLabel(`Role for ${viewer.email}`).selectOption("editor");
    await expect(remote.getByRole("link", { name: "Edit", exact: true })).toBeVisible();
    await mutate(context, "patch", `/trips/${trip.id}`, { name: "Remote live edit" });
    await expect(remote.getByRole("heading", { name: "Remote live edit", exact: true })).toBeVisible();
    await remote.goto("/notifications");
    await remote.getByRole("button", { name: /Mark all.*read/i }).click();
    await expect(tab.getByRole("button", { name: /Mark all.*read/i })).toHaveCount(0);
    await remote.getByRole("button", { name: /^Mark as unread:/ }).first().click();
    await expect(tab.getByRole("button", { name: /Mark all.*read/i })).toBeVisible();
    await remote.getByRole("button", { name: /^Mark as read:/ }).first().click();
    await expect(tab.getByRole("button", { name: /Mark all.*read/i })).toHaveCount(0);
    await openTrip(remote, trip.id);
    await page.getByRole("button", { name: "Remove", exact: true }).click();
    await page.getByRole("button", { name: "Confirm remove", exact: true }).click();
    await expect(remote).toHaveURL(/\/trips$/);
    expect((await other.request.get(`${api}/api/trips/${trip.id}`)).status()).toBe(404);
    await other.setOffline(true);
    await other.setOffline(false);
    await remote.reload();
    await expect(remote.getByRole("link", { name: `Open Remote live edit`, exact: true })).toHaveCount(0);
  } finally { await other.close(); }
});

test("itinerary create/edit, pointer DnD, keyboard DnD and cross-Day Move persist", async ({ page, context, trip }) => {
  await openTrip(page, trip.id);
  for (const title of ["First item", "Second item", "Third item"]) {
    await page.getByRole("button", { name: "Add item to Day 1", exact: true }).click();
    await page.getByLabel("Title", { exact: true }).fill(title);
    await page.getByRole("button", { name: "Add item", exact: true }).click();
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  }
  const items = async () => (await (await context.request.get(`${api}/api/trips/${trip.id}/itinerary-items`)).json()) as { title: string; dayId: string }[];
  const before = await items();
  const source = page.getByRole("button", { name: "Reorder “First item” by drag or keyboard" });
  const target = page.getByRole("button", { name: "Reorder “Third item” by drag or keyboard" });
  await source.scrollIntoViewIfNeeded();
  const a = (await source.boundingBox())!;
  const b = (await target.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 25 });
  await page.mouse.up();
  await expect.poll(async () => (await items()).map(({ title }) => title)).not.toEqual(before.map(({ title }) => title));
  const keyboardBefore = (await items()).map(({ title }) => title);
  await source.scrollIntoViewIfNeeded();
  await expect(source).toBeEnabled();
  await source.focus();
  await expect(source).toBeFocused();
  const pickupAnnouncement = page
    .getByRole("status")
    .filter({ hasText: /^Picked up draggable item / });
  await expect(pickupAnnouncement).toHaveCount(0);
  await page.keyboard.press("Space");
  await expect(source).toHaveAttribute("aria-grabbed", "true");
  await expect(pickupAnnouncement).toBeAttached();
  await page.keyboard.press("ArrowUp", { delay: 350 });
  await expect(
    page.locator('[aria-live="polite"]').filter({
      hasText: /^Moved to position \d+ in Day \d+\.$/,
    }),
  ).toBeAttached();
  await page.keyboard.press("Space");
  await expect(source).toHaveAttribute("aria-grabbed", "false");
  await expect.poll(async () => (await items()).map(({ title }) => title)).not.toEqual(keyboardBefore);
  await page.getByRole("button", { name: "Edit “First item”", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("Edited item");
  await page.getByRole("button", { name: "Save item", exact: true }).click();
  await page.getByRole("button", { name: "Move “Edited item” without dragging" }).click();
  await page.getByLabel("Target Day").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Move item", exact: true }).click();
  await expect.poll(async () => (await items()).find(({ title }) => title === "Edited item")?.dayId).not.toBe(before[0]!.dayId);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Edited item", exact: true })).toBeVisible();
});

test("transport reservation create/edit uses authoritative API", async ({ page, context, trip }) => {
  await page.goto(`/trips/${trip.id}/reservations/new`);
  await page.getByLabel("Title", { exact: true }).fill("Stage31 train");
  await page.getByLabel("Kind", { exact: true }).selectOption("transport");
  await page.getByLabel("Mode", { exact: true }).selectOption("train");
  await page.getByLabel("Start date", { exact: true }).fill("2027-04-12");
  await page.getByLabel("Origin", { exact: true }).fill("Kyoto");
  await page.getByLabel("Destination", { exact: true }).fill("Osaka");
  await page.getByRole("button", { name: "Create reservation", exact: true }).click();
  await expect(page.getByText("Stage31 train", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Edit", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("Stage31 ferry");
  await page.getByLabel("Mode", { exact: true }).selectOption("ferry");
  await page.getByRole("button", { name: "Save reservation", exact: true }).click();
  await expect(page.getByText("Stage31 ferry", { exact: true })).toBeVisible();
  await expect.poll(async () => (await (await context.request.get(`${api}/api/trips/${trip.id}/reservations`)).json())[0].transport.mode).toBe("ferry");
});

test("equal/custom expense split and formatted balances agree with API", async ({ page, context, browser, identity, trip }) => {
  const other = await browser.newContext();
  const member = await register(other);
  await mutate(context, "post", `/trips/${trip.id}/members`, { email: member.email, role: "editor" });
  await other.close();
  await page.goto(`/trips/${trip.id}/expenses/new`);
  await page.getByLabel("Title", { exact: true }).fill("Dinner");
  await page.getByLabel("Amount", { exact: true }).fill("123.45");
  await page.getByLabel("Currency", { exact: true }).selectOption("USD");
  await page.getByLabel("Paid by", { exact: true }).selectOption(identity.id);
  for (const participant of [identity.email, member.email]) await page.getByRole("checkbox", { name: participant, exact: true }).check();
  await page.getByRole("button", { name: "Create expense", exact: true }).click();
  await expect(page.getByText(/\$123\.45/).first()).toBeVisible();
  const equal = await (await context.request.get(`${api}/api/trips/${trip.id}/expenses`)).json();
  expect(equal[0].splitMethod).toBe("equal");
  expect(equal[0].shares.map((share: { amountMinor: number }) => share.amountMinor).sort()).toEqual([6172, 6173]);
  await page.getByRole("link", { name: "Edit", exact: true }).click();
  await page.getByRole("radio", { name: "Custom", exact: true }).check();
  const ownerShare = page.getByRole("checkbox", { name: identity.email, exact: true }).locator("../..").getByLabel("Share in USD", { exact: true });
  const memberShare = page.getByRole("checkbox", { name: member.email, exact: true }).locator("../..").getByLabel("Share in USD", { exact: true });
  await ownerShare.fill("23.45");
  await memberShare.fill("100.00");
  await page.getByRole("button", { name: "Save expense", exact: true }).click();
  await expect.poll(async () => (await (await context.request.get(`${api}/api/trips/${trip.id}/expenses`)).json())[0].splitMethod).toBe("custom");
  const expenses = await (await context.request.get(`${api}/api/trips/${trip.id}/expenses`)).json();
  expect(expenses[0].amountMinor).toBe(12345);
  expect(expenses[0].splitMethod).toBe("custom");
  const balances = await context.request.get(`${api}/api/trips/${trip.id}/expenses/balances`);
  expect(balances.ok()).toBe(true);
  const balance = (await balances.json()).currencies[0];
  expect(balance.settlements[0]).toMatchObject({ amountMinor: 10000, from: { userId: member.id }, to: { userId: identity.id } });
  await expect(page.getByText(/→.*\$100\.00/)).toBeVisible();
  await expect(page.getByText(/\$123\.45/).first()).toBeVisible();
});

test("direct S3 upload, downloaded bytes and deletion", async ({ page, context, trip }) => {
  const bytes = Buffer.from("%PDF-1.7\nStage31 real storage verification\n%%EOF\n");
  await page.goto(`/trips/${trip.id}/documents`);
  await page.getByLabel("File", { exact: true }).setInputFiles({ name: "stage31.pdf", mimeType: "application/pdf", buffer: bytes });
  await page.getByLabel("Title", { exact: true }).fill("Stage31 ticket");
  const put = page.waitForResponse((response) => response.request().method() === "PUT" && response.url().includes("tripforge-readiness"));
  await page.getByRole("button", { name: "Upload document", exact: true }).click();
  expect((await put).ok()).toBe(true);
  await expect(page.getByRole("button", { name: "Download Stage31 ticket" })).toBeVisible();
  const documents = await (await context.request.get(`${api}/api/trips/${trip.id}/documents`)).json();
  const signed = await (await context.request.get(`${api}/api/trips/${trip.id}/documents/${documents[0].id}/download`)).json();
  const response = await context.request.get(signed.url);
  expect(Buffer.compare(await response.body(), bytes)).toBe(0);
  // Exercise the browser's actual download action as well as byte verification.
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download Stage31 ticket" }).click();
  expect(Buffer.compare(await readFile((await (await download).path())!), bytes)).toBe(0);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete Stage31 ticket" }).click();
  await expect(page.getByRole("button", { name: "Download Stage31 ticket" })).toHaveCount(0);
});

test("search filters, navigation and empty results", async ({ page, context, trip }) => {
  const days = await (await context.request.get(`${api}/api/trips/${trip.id}/days`)).json();
  await mutate(context, "post", `/trips/${trip.id}/itinerary-items`, { dayId: days[0].id, title: "Searchable museum", kind: "activity" });
  await page.goto(`/trips/${trip.id}/search`);
  await page.getByLabel("Search this trip").fill("Searchable");
  await page.getByRole("button", { name: "Itinerary", exact: true }).click();
  await page.getByRole("link", { name: /Searchable museum/ }).click();
  await expect(page).toHaveURL(new RegExp(`/trips/${trip.id}`));
  await page.goto(`/trips/${trip.id}/search`);
  await page.getByLabel("Search this trip").fill("no-result-unique");
  await expect(page.getByText("No matches found.", { exact: true })).toBeVisible();
});

test("assistant SSE Stop, preview, explicit Apply and Dismiss", async ({ page, context, trip }) => {
  await page.goto(`/trips/${trip.id}/assistant`);
  await page.getByRole("button", { name: "New chat", exact: true }).first().click();
  await page.getByLabel("Message", { exact: true }).fill("slow grounded reply");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(page.getByLabel("Message", { exact: true })).toBeEnabled();
  const conversationId = await page.getByLabel("Conversation", { exact: true }).inputValue();
  await expect.poll(async () => {
    const conversation = await (await context.request.get(`${api}/api/trips/${trip.id}/assistant/conversations/${conversationId}`)).json();
    return conversation.turns.some((turn: { status: string }) => turn.status === "pending");
  }).toBe(false);
  await page.getByLabel("Message", { exact: true }).fill("suggest an itinerary item");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByRole("button", { name: "Apply", exact: true }).last()).toBeEnabled();
  const list = async () => await (await context.request.get(`${api}/api/trips/${trip.id}/itinerary-items`)).json();
  expect(await list()).toHaveLength(0);
  await page.getByRole("button", { name: "Apply", exact: true }).last().click();
  await expect.poll(async () => (await list()).length).toBe(1);
  await page.getByLabel("Message", { exact: true }).fill("suggest another itinerary item");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.getByRole("button", { name: "Dismiss", exact: true }).last().click();
  expect(await list()).toHaveLength(1);
});

test("mobile keyboard navigation, place combobox and assistant composer", async ({ page, context, trip }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.route("https://api.maptiler.com/geocoding/**", (route) => route.fulfill({ json: { type: "FeatureCollection", attribution: "Test-only provider boundary", features: [{ id: "stage31-museum", text: "Museum", place_name: "Museum, Tokyo", center: [139.7,35.7] }] } }));
  await page.route("https://api.maptiler.com/maps/**", (route) => route.fulfill({ json: { version: 8, sources: {}, layers: [] } }));
  await openTrip(page, trip.id);
  const menu = page.getByRole("button", { name: "Menu, open navigation" });
  await menu.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("navigation", { name: "Mobile navigation" }).getByRole("link", { name: "Overview", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toBeFocused();
  await page.getByRole("button", { name: "Add item to Day 1", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("Keyboard museum");
  const combobox = page.getByRole("combobox", { name: /Place/ });
  await combobox.fill("Museum");
  await expect(page.getByRole("option", { name: /Museum, Tokyo/ })).toBeVisible();
  await combobox.press("ArrowDown");
  await combobox.press("Enter");
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await expect.poll(async () => (await (await context.request.get(`${api}/api/trips/${trip.id}/itinerary-items`)).json())[0]?.place?.name).toBe("Museum");
  await page.goto(`/trips/${trip.id}/assistant`);
  await page.getByRole("button", { name: "New chat", exact: true }).first().click();
  await page.getByLabel("Message", { exact: true }).fill("Summarize my trip");
  await page.getByLabel("Message", { exact: true }).press("Control+Enter");
  await expect(page.getByText("Grounded browser response.", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("viewer's private assistant cannot Apply, and other users cannot read conversation", async ({ page, context, browser, trip }) => {
  const viewerContext = await browser.newContext();
  try {
    const viewer = await register(viewerContext);
    await mutate(context, "post", `/trips/${trip.id}/members`, { email: viewer.email, role: "viewer" });
    const remote = await viewerContext.newPage();
    await remote.goto(`http://127.0.0.1:3310/trips/${trip.id}/assistant`);
    await remote.getByRole("button", { name: "New chat", exact: true }).first().click();
    await remote.getByLabel("Message", { exact: true }).fill("suggest an itinerary item");
    await remote.getByRole("button", { name: "Send", exact: true }).click();
    await expect(remote.getByRole("button", { name: "Apply", exact: true })).toBeDisabled();
    const id = await remote.getByLabel("Conversation", { exact: true }).inputValue();
    expect((await context.request.get(`${api}/api/trips/${trip.id}/assistant/conversations/${id}`)).status()).toBe(404);
    await page.goto(`/trips/${trip.id}`);
    await expect(page.getByRole("heading", { name: "Browser AI suggestion", exact: true })).toHaveCount(0);
    await remote.getByRole("button", { name: "Dismiss", exact: true }).click();
  } finally { await viewerContext.close(); }
});

test("axe, CSP and responsive critical screens + keyboard entry", async ({ page, trip }) => {
  const violations: string[] = [];
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (event) => { (window as unknown as { csp: string[] }).csp ??= []; (window as unknown as { csp: string[] }).csp.push(`${event.violatedDirective}:${event.blockedURI}:${event.sourceFile}:${event.lineNumber}:${event.sample}`); });
  });
  for (const path of ["/login", "/trips", `/trips/${trip.id}`, "/notifications", `/trips/${trip.id}/search`, `/trips/${trip.id}/assistant`]) {
    await page.goto(path);
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByText("Checking session…")).toHaveCount(0);
    // Capture application startup before adding test audit instrumentation.
    violations.push(...await page.evaluate(() => (window as unknown as { csp?: string[] }).csp ?? []));
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    expect(results.violations, `${path}: ${JSON.stringify(results.violations.map(({ id, nodes }) => ({ id, targets: nodes.map(({ target }) => target) })))}`).toEqual([]);
    for (const width of [320, 375, 768]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${path} at ${width}px`).toBe(true);
    }
    await page.setViewportSize({ width: 1280, height: 900 });
  }
  expect(violations).toEqual([]);
  await page.goto(`/trips/${trip.id}`);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
});
