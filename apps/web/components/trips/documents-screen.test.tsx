import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ItineraryItem, Trip, TripDocument } from "@tripforge/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { tripsApi } from "@/lib/api/trips";
import { uploadFile } from "@/lib/documents/upload-file";
import { tripKeys } from "@/lib/trips/query-keys";
import { renderWithQueryClient } from "@/test-utils";

import { DocumentsScreen } from "./documents-screen";

vi.mock("@/lib/documents/upload-file", () => ({ uploadFile: vi.fn() }));

const trip: Trip = {
  accessRole: "owner",
  createdAt: "2027-01-01T00:00:00.000Z",
  endsOn: "2027-04-20",
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  name: "Japan",
  startsOn: "2027-04-10",
  updatedAt: "2027-01-01T00:00:00.000Z",
};

const document: TripDocument = {
  contentType: "application/pdf",
  createdAt: "2027-01-02T00:00:00.000Z",
  fileName: "ticket.pdf",
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  kind: "ticket",
  link: null,
  readyAt: "2027-01-02T00:01:00.000Z",
  sizeBytes: 42 * 1024,
  status: "ready",
  title: "Beijing flight ticket",
  uploadedBy: {
    displayName: "Artur",
    email: "artur@example.com",
    userId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  },
};

const itineraryItem: ItineraryItem = {
  createdAt: "2027-01-01T00:00:00.000Z",
  dayId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  kind: "food",
  notes: null,
  place: null,
  position: 0,
  startTime: "19:30",
  title: "Dinner in Shibuya",
  updatedAt: "2027-01-01T00:00:00.000Z",
};

function uploadIntent() {
  return {
    document: { ...document, status: "pending" as const, readyAt: null },
    upload: {
      expiresAt: "2027-01-01T00:10:00.000Z",
      headers: { "Content-Type": "application/pdf" as const },
      method: "PUT" as const,
      url: "http://localhost:4566/presigned",
    },
  };
}

describe("DocumentsScreen", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(uploadFile).mockResolvedValue();
    vi.spyOn(tripsApi, "get").mockResolvedValue(trip);
    vi.spyOn(tripsApi, "listDocuments").mockResolvedValue([document]);
    vi.spyOn(tripsApi, "listItineraryItems").mockResolvedValue([]);
    vi.spyOn(tripsApi, "listReservations").mockResolvedValue([]);
    vi.spyOn(tripsApi, "listExpenses").mockResolvedValue([]);
  });

  it("renders private document metadata as responsive cards", async () => {
    renderWithQueryClient(<DocumentsScreen tripId={trip.id} />);
    expect(await screen.findByText("Beijing flight ticket")).toBeVisible();
    expect(screen.getByText("ticket.pdf")).toBeVisible();
    expect(screen.getByText("PDF · 42 KB")).toBeVisible();
    expect(screen.getByText("Uploaded by Artur")).toBeVisible();
    expect(screen.getByText("Trip-level document")).toBeVisible();
  });

  it("renders loading and empty states", async () => {
    vi.spyOn(tripsApi, "listDocuments").mockImplementation(
      () => new Promise(() => undefined),
    );
    const pending = renderWithQueryClient(<DocumentsScreen tripId={trip.id} />);
    expect(await screen.findByText("Loading documents…")).toBeVisible();
    pending.unmount();

    vi.spyOn(tripsApi, "listDocuments").mockResolvedValue([]);
    renderWithQueryClient(<DocumentsScreen tripId={trip.id} />);
    expect(await screen.findByText("No uploaded documents yet.")).toBeVisible();
  });

  it("renders an intentional viewer mode", async () => {
    vi.spyOn(tripsApi, "get").mockResolvedValue({ ...trip, accessRole: "viewer" });
    renderWithQueryClient(<DocumentsScreen tripId={trip.id} />);
    expect(await screen.findByText("Beijing flight ticket")).toBeVisible();
    expect(screen.queryByText("Upload document")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download" })).toBeVisible();
    await waitFor(() => {
      expect(tripsApi.listItineraryItems).toHaveBeenCalled();
      expect(tripsApi.listReservations).toHaveBeenCalled();
      expect(tripsApi.listExpenses).toHaveBeenCalled();
    });
  });

  it("runs init, direct PUT and completion before invalidating the list", async () => {
    const user = userEvent.setup();
    const create = vi
      .spyOn(tripsApi, "createDocumentUpload")
      .mockResolvedValue(uploadIntent());
    const complete = vi
      .spyOn(tripsApi, "completeDocumentUpload")
      .mockResolvedValue(document);
    const { queryClient } = renderWithQueryClient(<DocumentsScreen tripId={trip.id} />);
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const file = new File(["pdf bytes"], "new-ticket.pdf", {
      type: "application/pdf",
    });
    await user.upload(await screen.findByLabelText("File"), file);
    expect(screen.getByLabelText("Title")).toHaveValue("new-ticket");
    await user.click(screen.getByRole("button", { name: "Upload document" }));

    await waitFor(() => expect(complete).toHaveBeenCalledWith(trip.id, document.id));
    expect(create).toHaveBeenCalledWith(
      trip.id,
      expect.objectContaining({
        contentType: "application/pdf",
        fileName: "new-ticket.pdf",
        sizeBytes: 9,
        title: "new-ticket",
      }),
    );
    expect(uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({ file, url: "http://localhost:4566/presigned" }),
    );
    expect(invalidate).toHaveBeenCalledWith({
      exact: true,
      queryKey: tripKeys.documents(trip.id),
    });
  });

  it("rejects unsupported files before creating an upload intent", async () => {
    const create = vi.spyOn(tripsApi, "createDocumentUpload");
    renderWithQueryClient(<DocumentsScreen tripId={trip.id} />);
    fireEvent.change(await screen.findByLabelText("File"), {
      target: {
        files: [new File(["<svg/>"], "unsafe.svg", { type: "image/svg+xml" })],
      },
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Choose a PDF, JPEG, PNG or WebP file.");
    expect(create).not.toHaveBeenCalled();
  });

  it("preserves an edited title when a different valid file is selected", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<DocumentsScreen tripId={trip.id} />);
    const input = await screen.findByLabelText("File");
    await user.upload(
      input,
      new File(["one"], "first.pdf", { type: "application/pdf" }),
    );
    const title = screen.getByLabelText("Title");
    expect(title).toHaveValue("first");
    await user.clear(title);
    await user.type(title, "My title");
    await user.upload(
      input,
      new File(["two"], "second.pdf", { type: "application/pdf" }),
    );
    expect(title).toHaveValue("My title");
  });

  it("retries finalization without uploading the bytes again", async () => {
    const user = userEvent.setup();
    vi.spyOn(tripsApi, "createDocumentUpload").mockResolvedValue(uploadIntent());
    const complete = vi
      .spyOn(tripsApi, "completeDocumentUpload")
      .mockRejectedValueOnce(new TypeError("storage unavailable"))
      .mockResolvedValueOnce(document);
    renderWithQueryClient(<DocumentsScreen tripId={trip.id} />);
    await user.upload(
      await screen.findByLabelText("File"),
      new File(["pdf bytes"], "ticket.pdf", { type: "application/pdf" }),
    );
    await user.click(screen.getByRole("button", { name: "Upload document" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Upload could not be verified",
    );
    await user.click(screen.getByRole("button", { name: "Retry verification" }));
    expect(await screen.findByText("Document uploaded.")).toBeVisible();
    expect(complete).toHaveBeenCalledTimes(2);
    expect(uploadFile).toHaveBeenCalledTimes(1);
  });

  it("isolates upload-init and PUT failures with safe messages", async () => {
    const user = userEvent.setup();
    vi.spyOn(tripsApi, "createDocumentUpload").mockRejectedValueOnce(
      new TypeError("internal detail"),
    );
    const first = renderWithQueryClient(<DocumentsScreen tripId={trip.id} />);
    await user.upload(
      await screen.findByLabelText("File"),
      new File(["pdf bytes"], "ticket.pdf", { type: "application/pdf" }),
    );
    await user.click(screen.getByRole("button", { name: "Upload document" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to start upload",
    );
    expect(screen.queryByText("internal detail")).not.toBeInTheDocument();
    first.unmount();

    vi.spyOn(tripsApi, "createDocumentUpload").mockResolvedValue(uploadIntent());
    vi.mocked(uploadFile).mockRejectedValueOnce(new TypeError("S3 detail"));
    renderWithQueryClient(<DocumentsScreen tripId={trip.id} />);
    await user.upload(
      await screen.findByLabelText("File"),
      new File(["pdf bytes"], "ticket.pdf", { type: "application/pdf" }),
    );
    await user.click(screen.getByRole("button", { name: "Upload document" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Upload failed");
    expect(
      screen.queryByRole("button", { name: "Retry verification" }),
    ).not.toBeInTheDocument();
  });

  it("aborts the active XHR upload and reports cancellation", async () => {
    const user = userEvent.setup();
    vi.spyOn(tripsApi, "createDocumentUpload").mockResolvedValue(uploadIntent());
    vi.mocked(uploadFile).mockImplementation(
      ({ signal }) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener("abort", () => {
            reject(new DOMException("Upload cancelled", "AbortError"));
          });
        }),
    );
    renderWithQueryClient(<DocumentsScreen tripId={trip.id} />);
    await user.upload(
      await screen.findByLabelText("File"),
      new File(["pdf bytes"], "ticket.pdf", { type: "application/pdf" }),
    );
    await user.click(screen.getByRole("button", { name: "Upload document" }));
    await user.click(await screen.findByRole("button", { name: "Cancel upload" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Upload cancelled",
    );
    expect(
      screen.queryByRole("button", { name: "Retry verification" }),
    ).not.toBeInTheDocument();
  });

  it("shows a contextual link and updates editable metadata", async () => {
    const user = userEvent.setup();
    const linked = {
      ...document,
      link: { id: itineraryItem.id, type: "itinerary" as const },
    };
    vi.spyOn(tripsApi, "listDocuments").mockResolvedValue([linked]);
    vi.spyOn(tripsApi, "listItineraryItems").mockResolvedValue([itineraryItem]);
    const update = vi.spyOn(tripsApi, "updateDocument").mockResolvedValue({
      ...linked,
      kind: "booking",
      title: "Dinner confirmation",
    });
    renderWithQueryClient(<DocumentsScreen tripId={trip.id} />);
    expect(
      (await screen.findAllByText("Itinerary · Dinner in Shibuya")).some(
        (element) => element.tagName === "P",
      ),
    ).toBe(true);
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const title = screen.getAllByLabelText("Title").at(-1)!;
    await user.clear(title);
    await user.type(title, "Dinner confirmation");
    await user.selectOptions(screen.getByLabelText("Kind", { selector: `#edit-kind-${document.id}` }), "booking");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(update).toHaveBeenCalledWith(trip.id, document.id, {
        kind: "booking",
        link: { id: itineraryItem.id, type: "itinerary" },
        title: "Dinner confirmation",
      });
    });
  });

  it("shows a controlled per-document download error", async () => {
    const user = userEvent.setup();
    vi.spyOn(tripsApi, "getDocumentDownload").mockRejectedValue(
      new TypeError("signing detail"),
    );
    renderWithQueryClient(<DocumentsScreen tripId={trip.id} />);
    await user.click(await screen.findByRole("button", { name: "Download" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to create a download link",
    );
    expect(screen.queryByText("signing detail")).not.toBeInTheDocument();
  });

  it("deletes metadata after explicit confirmation", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const remove = vi.spyOn(tripsApi, "removeDocument").mockResolvedValue();
    renderWithQueryClient(<DocumentsScreen tripId={trip.id} />);
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith(trip.id, document.id));
  });
});
