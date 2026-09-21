"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateDocumentUploadRequest,
  TripDocument,
  TripDocumentContentType,
  TripDocumentKind,
  TripDocumentLink,
} from "@tripforge/contracts";
import {
  formatMinorAmount,
  MAX_TRIP_DOCUMENT_SIZE_BYTES,
  TRIP_DOCUMENT_CONTENT_TYPES,
} from "@tripforge/contracts";
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from "@tripforge/ui";

import { ApiClientError } from "@/lib/api/errors";
import { tripsApi } from "@/lib/api/trips";
import { formatFileSize } from "@/lib/documents/format-file-size";
import { uploadFile } from "@/lib/documents/upload-file";
import { tripKeys } from "@/lib/trips/query-keys";

type UploadState = "idle" | "creating" | "uploading" | "finalizing" | "success" | "error";

const KIND_LABELS: Record<TripDocumentKind, string> = {
  booking: "Booking",
  image: "Image",
  other: "Other",
  receipt: "Receipt",
  ticket: "Ticket",
};

const MIME_LABELS: Record<TripDocumentContentType, string> = {
  "application/pdf": "PDF",
  "image/jpeg": "JPEG image",
  "image/png": "PNG image",
  "image/webp": "WebP image",
};

export function DocumentsScreen({ tripId }: Readonly<{ tripId: string }>) {
  const queryClient = useQueryClient();
  const tripQuery = useQuery({
    queryFn: ({ signal }) => tripsApi.get(tripId, { signal }),
    queryKey: tripKeys.detail(tripId),
  });
  const documentsQuery = useQuery({
    queryFn: ({ signal }) => tripsApi.listDocuments(tripId, { signal }),
    queryKey: tripKeys.documents(tripId),
  });
  const canEdit = tripQuery.data?.accessRole !== "viewer";
  const relatedEnabled = Boolean(tripQuery.data);
  const itineraryQuery = useQuery({
    enabled: relatedEnabled,
    queryFn: ({ signal }) => tripsApi.listItineraryItems(tripId, { signal }),
    queryKey: tripKeys.itinerary(tripId),
  });
  const reservationsQuery = useQuery({
    enabled: relatedEnabled,
    queryFn: ({ signal }) => tripsApi.listReservations(tripId, { signal }),
    queryKey: tripKeys.reservations(tripId),
  });
  const expensesQuery = useQuery({
    enabled: relatedEnabled,
    queryFn: ({ signal }) => tripsApi.listExpenses(tripId, { signal }),
    queryKey: tripKeys.expenses(tripId),
  });

  if (tripQuery.isPending || documentsQuery.isPending) {
    return <DocumentState title="Loading documents…" loading />;
  }
  const queryError = tripQuery.error ?? documentsQuery.error;
  if (queryError instanceof ApiClientError && queryError.status === 401) {
    return <DocumentState title="Sign in to view documents."><Link className={linkClasses} href="/login">Sign in</Link></DocumentState>;
  }
  if (queryError instanceof ApiClientError && queryError.status === 404) {
    return <DocumentState title="Trip not found"><Link className={linkClasses} href="/trips">Back to trips</Link></DocumentState>;
  }
  if (queryError || !tripQuery.data || !documentsQuery.data) {
    return <DocumentState title="Unable to load documents."><Button variant="secondary" onClick={() => void documentsQuery.refetch()}>Try again</Button></DocumentState>;
  }

  const links = buildLinkOptions(
    itineraryQuery.data ?? [],
    reservationsQuery.data ?? [],
    expensesQuery.data ?? [],
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="break-words text-3xl font-bold">Documents</h1>
          <p className="mt-2 text-[var(--muted-foreground)]">
            Private tickets, confirmations, receipts and images for {tripQuery.data.name}.
          </p>
        </div>
        <Link className={secondaryLinkClasses} href={`/trips/${tripId}`}>Trip workspace</Link>
      </header>

      {canEdit ? (
        <DocumentUploadForm
          links={links}
          tripId={tripId}
          onReady={async () => {
            await queryClient.invalidateQueries({
              exact: true,
              queryKey: tripKeys.documents(tripId),
            });
          }}
        />
      ) : (
        <Alert>Viewer access: documents can be downloaded, but not uploaded, edited or deleted.</Alert>
      )}

      {documentsQuery.data.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-[var(--muted-foreground)]">No uploaded documents yet.</CardContent></Card>
      ) : (
        <DocumentList
          canEdit={canEdit}
          documents={documentsQuery.data}
          links={links}
          linkLabels={new Map(links.map(({ label, value }) => [value, label]))}
          tripId={tripId}
          onChanged={async () => {
            await queryClient.invalidateQueries({
              exact: true,
              queryKey: tripKeys.documents(tripId),
            });
          }}
        />
      )}
    </div>
  );
}

function DocumentUploadForm({
  links,
  onReady,
  tripId,
}: Readonly<{
  links: LinkOption[];
  onReady: () => Promise<void>;
  tripId: string;
}>) {
  const fileInput = useRef<HTMLInputElement>(null);
  const abortController = useRef<AbortController | undefined>(undefined);
  const [file, setFile] = useState<File>();
  const [title, setTitle] = useState("");
  const [titleEdited, setTitleEdited] = useState(false);
  const [kind, setKind] = useState<TripDocumentKind>("other");
  const [linkValue, setLinkValue] = useState("");
  const [state, setState] = useState<UploadState>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string>();
  const [pendingDocumentId, setPendingDocumentId] = useState<string>();
  const busy = state === "creating" || state === "uploading" || state === "finalizing";

  function chooseFile(selected: File | undefined) {
    setError(undefined);
    if (!selected) {
      setFile(undefined);
      return;
    }
    if (!isSupportedContentType(selected.type)) {
      setError("Choose a PDF, JPEG, PNG or WebP file.");
      setFile(undefined);
      return;
    }
    if (selected.size < 1 || selected.size > MAX_TRIP_DOCUMENT_SIZE_BYTES) {
      setError("File size must be between 1 byte and 25 MiB.");
      setFile(undefined);
      return;
    }
    setFile(selected);
    if (!titleEdited && !title.trim()) setTitle(defaultTitle(selected.name));
  }

  async function finalize(documentId: string) {
    setState("finalizing");
    setError(undefined);
    try {
      await tripsApi.completeDocumentUpload(tripId, documentId);
      setState("success");
      setPendingDocumentId(undefined);
      setFile(undefined);
      setTitle("");
      setTitleEdited(false);
      setProgress(0);
      if (fileInput.current) fileInput.current.value = "";
      await onReady();
    } catch {
      setState("error");
      setPendingDocumentId(documentId);
      setError("Upload could not be verified. Retry finalization.");
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !title.trim() || !isSupportedContentType(file.type)) return;
    setError(undefined);
    setState("creating");
    setProgress(0);
    const input: CreateDocumentUploadRequest = {
      contentType: file.type,
      fileName: file.name,
      kind,
      link: parseLinkValue(linkValue),
      sizeBytes: file.size,
      title: title.trim(),
    };
    let documentId: string | undefined;
    try {
      const intent = await tripsApi.createDocumentUpload(tripId, input);
      documentId = intent.document.id;
      setPendingDocumentId(documentId);
      setState("uploading");
      const controller = new AbortController();
      abortController.current = controller;
      await uploadFile({
        file,
        headers: intent.upload.headers,
        onProgress: setProgress,
        signal: controller.signal,
        url: intent.upload.url,
      });
      abortController.current = undefined;
      await finalize(documentId);
    } catch (uploadError) {
      abortController.current = undefined;
      setPendingDocumentId(undefined);
      setState("error");
      setError(
        uploadError instanceof DOMException && uploadError.name === "AbortError"
          ? "Upload cancelled. The pending intent will be cleaned up later."
          : documentId
            ? "Upload failed. Start a fresh upload to retry."
            : "Unable to start upload. Please try again.",
      );
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle>Upload document</CardTitle></CardHeader>
      <CardContent>
        <form className="grid gap-4 md:grid-cols-2" onSubmit={(event) => void submit(event)}>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="document-file">File</Label>
            <Input
              ref={fileInput}
              accept="application/pdf,image/jpeg,image/png,image/webp"
              disabled={busy}
              id="document-file"
              type="file"
              onChange={(event) => chooseFile(event.target.files?.[0])}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="document-title">Title</Label>
            <Input
              disabled={busy}
              id="document-title"
              maxLength={200}
              required
              value={title}
              onChange={(event) => { setTitle(event.target.value); setTitleEdited(true); }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="document-kind">Kind</Label>
            <select className={selectClasses} disabled={busy} id="document-kind" value={kind} onChange={(event) => setKind(event.target.value as TripDocumentKind)}>
              {Object.entries(KIND_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="document-link">Link</Label>
            <select className={selectClasses} disabled={busy} id="document-link" value={linkValue} onChange={(event) => setLinkValue(event.target.value)}>
              <option value="">Trip level</option>
              {links.map((link) => <option key={link.value} value={link.value}>{link.label}</option>)}
            </select>
          </div>

          {state === "uploading" ? (
            <div className="space-y-2 md:col-span-2" role="status">
              <p>Uploading… {progress}%</p>
              <progress className="h-3 w-full" max={100} value={progress}>{progress}%</progress>
            </div>
          ) : null}
          {state === "finalizing" ? <p className="md:col-span-2" role="status">Finalizing…</p> : null}
          {state === "success" ? <Alert className="md:col-span-2">Document uploaded.</Alert> : null}
          {error ? <Alert className="md:col-span-2" role="alert">{error}</Alert> : null}

          <div className="flex flex-wrap gap-3 md:col-span-2">
            <Button disabled={busy || !file || !title.trim()} type="submit">
              {state === "creating" ? "Creating…" : "Upload document"}
            </Button>
            {state === "uploading" ? <Button variant="secondary" onClick={() => abortController.current?.abort()}>Cancel upload</Button> : null}
            {pendingDocumentId && state === "error" ? <Button variant="secondary" onClick={() => void finalize(pendingDocumentId)}>Retry verification</Button> : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function DocumentList({
  canEdit,
  documents,
  links,
  linkLabels,
  onChanged,
  tripId,
}: Readonly<{
  canEdit: boolean;
  documents: TripDocument[];
  links: LinkOption[];
  linkLabels: ReadonlyMap<string, string>;
  onChanged: () => Promise<void>;
  tripId: string;
}>) {
  const [error, setError] = useState<string>();
  const [pendingId, setPendingId] = useState<string>();
  const [editingId, setEditingId] = useState<string>();
  const [editTitle, setEditTitle] = useState("");
  const [editKind, setEditKind] = useState<TripDocumentKind>("other");
  const [editLink, setEditLink] = useState("");

  async function download(document: TripDocument) {
    setPendingId(document.id);
    setError(undefined);
    try {
      const result = await tripsApi.getDocumentDownload(tripId, document.id);
      window.location.assign(result.url);
    } catch {
      setError("Unable to create a download link. Please try again.");
    } finally {
      setPendingId(undefined);
    }
  }

  async function remove(document: TripDocument) {
    if (!window.confirm(`Delete “${document.title}”? This removes the document from TripForge.`)) return;
    setPendingId(document.id);
    setError(undefined);
    try {
      await tripsApi.removeDocument(tripId, document.id);
      await onChanged();
    } catch {
      setError("Unable to delete document. Please try again.");
    } finally {
      setPendingId(undefined);
    }
  }

  async function save(document: TripDocument) {
    if (!editTitle.trim()) return;
    setPendingId(document.id);
    setError(undefined);
    try {
      await tripsApi.updateDocument(tripId, document.id, {
        kind: editKind,
        link: parseLinkValue(editLink),
        title: editTitle.trim(),
      });
      setEditingId(undefined);
      await onChanged();
    } catch {
      setError("Unable to update document. Please try again.");
    } finally {
      setPendingId(undefined);
    }
  }

  return (
    <section className="space-y-4" aria-labelledby="document-list-title">
      <h2 className="text-2xl font-bold" id="document-list-title">Uploaded documents</h2>
      {error ? <Alert role="alert">{error}</Alert> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        {documents.map((document) => {
          const label = document.link ? linkLabels.get(linkToValue(document.link)) : undefined;
          const editing = editingId === document.id;
          return (
            <Card key={document.id}>
              <CardHeader>
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">{KIND_LABELS[document.kind]}</p>
                <CardTitle className="break-words">{document.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="min-w-0 space-y-1 text-sm">
                  <p className="truncate" title={document.fileName}>{document.fileName}</p>
                  <p>{MIME_LABELS[document.contentType]} · {formatFileSize(document.sizeBytes)}</p>
                  <p className="break-words">Uploaded by {participantName(document)}</p>
                  <p>{new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(document.createdAt))}</p>
                  <p className="break-words text-[var(--muted-foreground)]">{label ?? (document.link ? "Linked item unavailable" : "Trip-level document")}</p>
                </div>

                {editing ? (
                  <div className="grid gap-3 rounded-[var(--radius-md)] bg-[var(--surface-muted)] p-3">
                    <Label htmlFor={`edit-title-${document.id}`}>Title</Label>
                    <Input id={`edit-title-${document.id}`} maxLength={200} value={editTitle} onChange={(event) => setEditTitle(event.target.value)} />
                    <Label htmlFor={`edit-kind-${document.id}`}>Kind</Label>
                    <select className={selectClasses} id={`edit-kind-${document.id}`} value={editKind} onChange={(event) => setEditKind(event.target.value as TripDocumentKind)}>
                      {Object.entries(KIND_LABELS).map(([value, kindLabel]) => <option key={value} value={value}>{kindLabel}</option>)}
                    </select>
                    <Label htmlFor={`edit-link-${document.id}`}>Link</Label>
                    <select className={selectClasses} id={`edit-link-${document.id}`} value={editLink} onChange={(event) => setEditLink(event.target.value)}>
                      <option value="">Trip level</option>
                      {links.map((link) => <option key={link.value} value={link.value}>{link.label}</option>)}
                    </select>
                    <div className="flex flex-wrap gap-2">
                      <Button disabled={pendingId === document.id || !editTitle.trim()} size="sm" onClick={() => void save(document)}>Save</Button>
                      <Button size="sm" variant="secondary" onClick={() => setEditingId(undefined)}>Cancel</Button>
                    </div>
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-2 border-t border-[var(--border)] pt-4">
                  <Button disabled={pendingId === document.id} size="sm" variant="secondary" onClick={() => void download(document)}>Download</Button>
                  {canEdit ? <Button disabled={pendingId === document.id} size="sm" variant="secondary" onClick={() => { setEditingId(document.id); setEditTitle(document.title); setEditKind(document.kind); setEditLink(document.link ? linkToValue(document.link) : ""); }}>Edit</Button> : null}
                  {canEdit ? <Button className="text-[var(--danger)]" disabled={pendingId === document.id} size="sm" variant="ghost" onClick={() => void remove(document)}>Delete</Button> : null}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

type LinkOption = Readonly<{ label: string; value: string }>;

function buildLinkOptions(
  itinerary: Awaited<ReturnType<typeof tripsApi.listItineraryItems>>,
  reservations: Awaited<ReturnType<typeof tripsApi.listReservations>>,
  expenses: Awaited<ReturnType<typeof tripsApi.listExpenses>>,
): LinkOption[] {
  return [
    ...itinerary.map((item) => ({ label: `Itinerary · ${item.title}`, value: `itinerary:${item.id}` })),
    ...reservations.map((item) => ({ label: `Reservation · ${item.title} · ${item.startDate}`, value: `reservation:${item.id}` })),
    ...expenses.map((item) => ({ label: `Expense · ${item.title} · ${formatMinorAmount(item.amountMinor, item.currency)}`, value: `expense:${item.id}` })),
  ];
}

function parseLinkValue(value: string): TripDocumentLink {
  if (!value) return null;
  const [type, id] = value.split(":", 2);
  if (!id || (type !== "itinerary" && type !== "reservation" && type !== "expense")) return null;
  return { id, type };
}

function linkToValue(link: NonNullable<TripDocumentLink>): string {
  return `${link.type}:${link.id}`;
}

function isSupportedContentType(value: string): value is TripDocumentContentType {
  return (TRIP_DOCUMENT_CONTENT_TYPES as readonly string[]).includes(value);
}

function defaultTitle(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "").trim().slice(0, 200) || "Document";
}

function participantName(document: TripDocument): string {
  return document.uploadedBy.displayName?.trim() || document.uploadedBy.email;
}

function DocumentState({ children, loading, title }: Readonly<{ children?: React.ReactNode; loading?: boolean; title: string }>) {
  return <Card><CardContent className="space-y-4 py-10 text-center"><p className="font-semibold" role={loading ? "status" : undefined}>{title}</p>{children}</CardContent></Card>;
}

const selectClasses = "min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[var(--foreground)] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-50";
const linkClasses = "font-semibold text-[var(--primary)] hover:underline";
const secondaryLinkClasses = "inline-flex min-h-11 items-center justify-center rounded-[var(--radius-md)] bg-[var(--surface-muted)] px-5 py-2.5 font-semibold hover:bg-[var(--muted)]";
