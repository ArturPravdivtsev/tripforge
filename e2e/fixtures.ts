import { randomUUID } from "node:crypto";

import { test as base, expect, type BrowserContext, type Page } from "@playwright/test";

export const api = "http://127.0.0.1:3310";
export const password = "Stage 31 sufficiently long password";
export const mutationHeaders = { Origin: "http://127.0.0.1:3310", "X-TripForge-Request": "1" };
export type Identity = { email: string; id: string };

export async function register(context: BrowserContext): Promise<Identity> {
  const email = `stage31-${randomUUID()}@example.com`;
  const response = await context.request.post(`${api}/api/auth/register`, { headers: mutationHeaders, data: { displayName: email, email, password } });
  expect(response.status()).toBe(201);
  const body = await response.json();
  return { email, id: body.user.id };
}

export async function createTrip(context: BrowserContext, name = `Browser Trip ${randomUUID().slice(0, 8)}`) {
  const response = await context.request.post(`${api}/api/trips`, { headers: mutationHeaders, data: { name, startsOn: "2027-04-12", endsOn: "2027-04-13" } });
  expect(response.status()).toBe(201);
  return await response.json() as { id: string; name: string };
}

export async function mutate(context: BrowserContext, method: "post" | "patch" | "delete", path: string, data?: unknown) {
  const response = await context.request[method](`${api}/api${path}`, { headers: mutationHeaders, data });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.status() === 204 ? undefined : await response.json();
}

export async function openTrip(page: Page, tripId: string) {
  await page.goto(`/trips/${tripId}`);
  await expect(page.getByRole("navigation", { name: "Trip actions" })).toBeVisible();
}

export const test = base.extend<{ identity: Identity; trip: { id: string; name: string } }>({
  identity: async ({ context }, use) => { await use(await register(context)); },
  trip: async ({ context, identity }, use) => {
    void identity;
    const trip = await createTrip(context);
    await use(trip);
    await mutate(context, "delete", `/trips/${trip.id}`);
  },
});
export { expect };
