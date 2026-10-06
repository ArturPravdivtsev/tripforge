import { afterEach, describe, expect, it, vi } from "vitest";

import { tripsApi } from "./trips";

const trip = {
  accessRole: "owner" as const,
  createdAt: "2027-01-01T00:00:00.000Z",
  endsOn: null,
  id: "11111111-1111-4111-8111-111111111111",
  name: "Japan 2027",
  startsOn: "2027-04-12",
  updatedAt: "2027-01-01T00:00:00.000Z",
};

const participant = {
  role: "viewer" as const,
  user: {
    displayName: "Friend",
    email: "friend@example.com",
    id: "22222222-2222-4222-8222-222222222222",
  },
};

describe("tripsApi", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds paginated list URL and forwards AbortSignal", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ items: [], page: 2, pageSize: 6, total: 0, totalPages: 0 }),
      ),
    );
    const controller = new AbortController();
    vi.stubGlobal("fetch", fetchMock);

    await tripsApi.list({ page: 2, pageSize: 6 }, { signal: controller.signal });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trips?page=2&pageSize=6",
      expect.objectContaining({ credentials: "include", signal: controller.signal }),
    );
  });

  it("uses the detail URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(trip)));
    vi.stubGlobal("fetch", fetchMock);

    await tripsApi.get(trip.id);

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `/api/trips/${trip.id}`,
    );
  });

  it.each([
    ["create", "POST", "/api/trips", { name: "Japan 2027" }],
    ["update", "PATCH", `/api/trips/${trip.id}`, { name: "Japan 2028" }],
  ] as const)("sends a secured JSON %s request", async (operation, method, path, body) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(trip)));
    vi.stubGlobal("fetch", fetchMock);

    if (operation === "create") {
      await tripsApi.create(body);
    } else {
      await tripsApi.update(trip.id, body);
    }

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(options.headers);
    expect(url).toBe(`${path}`);
    expect(options.method).toBe(method);
    expect(options.credentials).toBe("include");
    expect(headers.get("X-TripForge-Request")).toBe("1");
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(options.body).toBe(JSON.stringify(body));
  });

  it("handles DELETE 204 without JSON parsing", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(tripsApi.remove(trip.id)).resolves.toBeUndefined();

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(options.headers);
    expect(options.method).toBe("DELETE");
    expect(headers.get("X-TripForge-Request")).toBe("1");
    expect(headers.has("Content-Type")).toBe(false);
  });

  it("lists members using the nested Trip URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([participant])),
    );
    vi.stubGlobal("fetch", fetchMock);

    await tripsApi.listMembers(trip.id);

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `/api/trips/${trip.id}/members`,
    );
  });

  it.each([
    ["add", "POST", `/api/trips/${trip.id}/members`, { email: participant.user.email, role: "viewer" }],
    ["change role", "PATCH", `/api/trips/${trip.id}/members/${participant.user.id}`, { role: "editor" }],
  ] as const)("sends a secured member %s request", async (operation, method, path, body) => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(participant)),
    );
    vi.stubGlobal("fetch", fetchMock);

    if (operation === "add") {
      await tripsApi.addMember(trip.id, body);
    } else {
      await tripsApi.updateMemberRole(trip.id, participant.user.id, body);
    }

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(options.headers);
    expect(url).toBe(`${path}`);
    expect(options.method).toBe(method);
    expect(headers.get("X-TripForge-Request")).toBe("1");
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(options.body).toBe(JSON.stringify(body));
  });

  it("removes a member with the browser mutation header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await tripsApi.removeMember(trip.id, participant.user.id);

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(options.headers);
    expect(url).toBe(
      `/api/trips/${trip.id}/members/${participant.user.id}`,
    );
    expect(options.method).toBe("DELETE");
    expect(headers.get("X-TripForge-Request")).toBe("1");
  });

  it.each([
    ["destinations", "listDestinations"],
    ["days", "listDays"],
    ["itinerary-items", "listItineraryItems"],
  ] as const)("lists nested %s using the Trip URL", async (resource, operation) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([])));
    vi.stubGlobal("fetch", fetchMock);

    await tripsApi[operation](trip.id);

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `/api/trips/${trip.id}/${resource}`,
    );
  });

  it.each([
    ["createDestination", "POST", "destinations", undefined, { name: "Tokyo" }],
    ["updateDestination", "PATCH", "destinations", "destination-id", { name: "Kyoto" }],
    ["reorderDestinations", "PATCH", "destinations/reorder", undefined, { destinationIds: ["destination-id"] }],
    ["updateDay", "PATCH", "days", "day-id", { destinationId: null }],
  ] as const)(
    "sends a secured nested %s request",
    async (operation, method, resource, nestedId, body) => {
      const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({})));
      vi.stubGlobal("fetch", fetchMock);

      if (operation === "createDestination") {
        await tripsApi.createDestination(trip.id, body);
      } else if (operation === "updateDestination") {
        await tripsApi.updateDestination(trip.id, nestedId, body);
      } else if (operation === "reorderDestinations") {
        await tripsApi.reorderDestinations(trip.id, {
          destinationIds: [...body.destinationIds],
        });
      } else {
        await tripsApi.updateDay(trip.id, nestedId, body);
      }

      const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
      const suffix = nestedId ? `/${nestedId}` : "";
      expect(url).toBe(
        `/api/trips/${trip.id}/${resource}${suffix}`,
      );
      expect(options.method).toBe(method);
      expect(new Headers(options.headers).get("X-TripForge-Request")).toBe("1");
      expect(options.body).toBe(JSON.stringify(body));
    },
  );

  it("deletes a destination through the nested URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await tripsApi.removeDestination(trip.id, "destination-id");

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `/api/trips/${trip.id}/destinations/destination-id`,
    );
    expect(options.method).toBe("DELETE");
    expect(new Headers(options.headers).get("X-TripForge-Request")).toBe("1");
  });

  it.each([
    { latitude: 35.6762, longitude: 139.6503 },
    { latitude: null, longitude: null },
  ])("sends destination coordinate PATCH body %#", async (body) => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({}))),
    );
    vi.stubGlobal("fetch", fetchMock);

    await tripsApi.updateDestination(trip.id, "destination-id", body);

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `/api/trips/${trip.id}/destinations/destination-id`,
    );
    expect(options.body).toBe(JSON.stringify(body));
  });

  it.each([
    ["createItineraryItem", "POST", "/itinerary-items", { dayId: "day-id", kind: "activity", title: "Museum" }],
    ["updateItineraryItem", "PATCH", "/itinerary-items/item-id", { title: "Gallery" }],
    ["reorderItineraryItems", "PATCH", "/itinerary-items/reorder", { days: [{ dayId: "day-id", itemIds: ["item-id"] }] }],
  ] as const)("sends a secured %s request", async (operation, method, suffix, body) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({})));
    vi.stubGlobal("fetch", fetchMock);

    if (operation === "createItineraryItem") {
      await tripsApi.createItineraryItem(trip.id, body);
    } else if (operation === "updateItineraryItem") {
      await tripsApi.updateItineraryItem(trip.id, "item-id", body);
    } else {
      await tripsApi.reorderItineraryItems(trip.id, {
        days: body.days.map(({ dayId, itemIds }) => ({
          dayId,
          itemIds: [...itemIds],
        })),
      });
    }

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`/api/trips/${trip.id}${suffix}`);
    expect(options.method).toBe(method);
    expect(new Headers(options.headers).get("X-TripForge-Request")).toBe("1");
    expect(options.body).toBe(JSON.stringify(body));
  });

  it("deletes an itinerary item through the nested URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await tripsApi.removeItineraryItem(trip.id, "item-id");

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `/api/trips/${trip.id}/itinerary-items/item-id`,
    );
    expect(options.method).toBe("DELETE");
  });

  it.each([
    ["create", "POST", "", { fromItemId: "from", mode: "walking", toItemId: "to" }],
    ["update", "PATCH", "/route-id", { mode: "cycling" }],
  ] as const)("sends route %s only to Nest", async (operation, method, suffix, body) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({})));
    vi.stubGlobal("fetch", fetchMock);
    if (operation === "create") await tripsApi.createRoute(trip.id, body);
    else await tripsApi.updateRoute(trip.id, "route-id", body);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`/api/trips/${trip.id}/routes${suffix}`);
    expect(url).not.toContain("api.heigit.org");
    expect(options.method).toBe(method);
    expect(options.body).toBe(JSON.stringify(body));
  });

  it("lists and deletes routes through Nest", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("[]"))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    await tripsApi.listRoutes(trip.id);
    await tripsApi.removeRoute(trip.id, "route-id");
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/trips/${trip.id}/routes`);
    expect(fetchMock.mock.calls[1]?.[0]).toBe(`/api/trips/${trip.id}/routes/route-id`);
  });

  it("lists and gets reservations through scoped Trip URLs", async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response("[]")),
    );
    vi.stubGlobal("fetch", fetchMock);
    await tripsApi.listReservations(trip.id);
    await tripsApi.getReservation(trip.id, "reservation-id");
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `/api/trips/${trip.id}/reservations`,
    );
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      `/api/trips/${trip.id}/reservations/reservation-id`,
    );
  });

  it.each([
    ["create", "POST", "", { kind: "activity", startDate: "2027-04-12", status: "pending", title: "Museum" }],
    ["update", "PATCH", "/reservation-id", { status: "cancelled" }],
  ] as const)("sends secured reservation %s request", async (operation, method, suffix, body) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({})));
    vi.stubGlobal("fetch", fetchMock);
    if (operation === "create") await tripsApi.createReservation(trip.id, body);
    else await tripsApi.updateReservation(trip.id, "reservation-id", body);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `/api/trips/${trip.id}/reservations${suffix}`,
    );
    expect(options.method).toBe(method);
    expect(options.body).toBe(JSON.stringify(body));
    expect(new Headers(options.headers).get("X-TripForge-Request")).toBe("1");
  });

  it("deletes a reservation with 204 support", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    await tripsApi.removeReservation(trip.id, "reservation-id");
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `/api/trips/${trip.id}/reservations/reservation-id`,
    );
    expect(options.method).toBe("DELETE");
  });

  it("lists expense detail and balances through scoped URLs", async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response("[]")),
    );
    vi.stubGlobal("fetch", fetchMock);
    await tripsApi.listExpenses(trip.id);
    await tripsApi.getExpense(trip.id, "expense-id");
    await tripsApi.getExpenseBalances(trip.id);
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      `/api/trips/${trip.id}/expenses`,
      `/api/trips/${trip.id}/expenses/expense-id`,
      `/api/trips/${trip.id}/expenses/balances`,
    ]);
  });

  it.each([
    ["create", "POST", ""],
    ["update", "PATCH", "/expense-id"],
  ] as const)("sends secured expense %s request", async (operation, method, suffix) => {
    const body = {
      amountMinor: 1250,
      category: "food" as const,
      currency: "EUR",
      paidByUserId: participant.user.id,
      spentOn: "2027-04-14",
      split: { method: "equal" as const, participantUserIds: [participant.user.id] },
      title: "Dinner",
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({})));
    vi.stubGlobal("fetch", fetchMock);
    if (operation === "create") await tripsApi.createExpense(trip.id, body);
    else await tripsApi.updateExpense(trip.id, "expense-id", body);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`/api/trips/${trip.id}/expenses${suffix}`);
    expect(options.method).toBe(method);
    expect(options.body).toBe(JSON.stringify(body));
  });

  it("deletes an expense with 204 support", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    await tripsApi.removeExpense(trip.id, "expense-id");
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `/api/trips/${trip.id}/expenses/expense-id`,
    );
    expect(options.method).toBe("DELETE");
  });

  it("lists documents and requests download capabilities through Nest", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("[]"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ url: "signed", expiresAt: "soon" })));
    vi.stubGlobal("fetch", fetchMock);
    await tripsApi.listDocuments(trip.id);
    await tripsApi.getDocumentDownload(trip.id, "document-id");
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      `/api/trips/${trip.id}/documents`,
      `/api/trips/${trip.id}/documents/document-id/download`,
    ]);
  });

  it("creates and completes a document upload intent through secured JSON APIs", async () => {
    const input = {
      contentType: "application/pdf" as const,
      fileName: "ticket.pdf",
      kind: "ticket" as const,
      sizeBytes: 42,
      title: "Ticket",
    };
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({}))),
    );
    vi.stubGlobal("fetch", fetchMock);
    await tripsApi.createDocumentUpload(trip.id, input);
    await tripsApi.completeDocumentUpload(trip.id, "document-id");
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `/api/trips/${trip.id}/documents/uploads`,
    );
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      `/api/trips/${trip.id}/documents/document-id/complete`,
    );
    for (const call of fetchMock.mock.calls) {
      const options = call[1] as RequestInit;
      expect(options.method).toBe("POST");
      expect(new Headers(options.headers).get("X-TripForge-Request")).toBe("1");
    }
  });

  it("updates and deletes document metadata through scoped URLs", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({})))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    await tripsApi.updateDocument(trip.id, "document-id", { title: "New title" });
    await tripsApi.removeDocument(trip.id, "document-id");
    expect(fetchMock.mock.calls.map((call) => [call[0], (call[1] as RequestInit).method])).toEqual([
      [`/api/trips/${trip.id}/documents/document-id`, "PATCH"],
      [`/api/trips/${trip.id}/documents/document-id`, "DELETE"],
    ]);
  });
});
