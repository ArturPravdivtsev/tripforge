import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { uploadFile } from "./upload-file";

class FakeXMLHttpRequest extends EventTarget {
  static instances: FakeXMLHttpRequest[] = [];
  readonly headers = new Map<string, string>();
  readonly open = vi.fn();
  readonly upload = new EventTarget();
  body?: File;
  status = 0;

  constructor() {
    super();
    FakeXMLHttpRequest.instances.push(this);
  }

  abort() {
    this.dispatchEvent(new Event("abort"));
  }

  send(body: File) {
    this.body = body;
  }

  setRequestHeader(name: string, value: string) {
    this.headers.set(name, value);
  }
}

describe("uploadFile", () => {
  beforeEach(() => {
    FakeXMLHttpRequest.instances = [];
    vi.stubGlobal("XMLHttpRequest", FakeXMLHttpRequest);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("PUTs the File with signed headers and reports real progress", async () => {
    const progress = vi.fn();
    const file = new File(["pdf bytes"], "ticket.pdf", {
      type: "application/pdf",
    });
    const result = uploadFile({
      file,
      headers: { "Content-Type": "application/pdf" },
      onProgress: progress,
      url: "http://localhost:4566/presigned",
    });
    const request = FakeXMLHttpRequest.instances[0];
    expect(request?.open).toHaveBeenCalledWith(
      "PUT",
      "http://localhost:4566/presigned",
    );
    expect(request?.headers.get("Content-Type")).toBe("application/pdf");
    expect(request?.body).toBe(file);

    request?.upload.dispatchEvent(
      new ProgressEvent("progress", { lengthComputable: true, loaded: 42, total: 100 }),
    );
    expect(progress).toHaveBeenCalledWith(42);
    if (request) request.status = 200;
    request?.dispatchEvent(new Event("load"));
    await expect(result).resolves.toBeUndefined();
  });

  it("rejects network failures", async () => {
    const result = uploadFile({
      file: new File(["x"], "image.png", { type: "image/png" }),
      headers: { "Content-Type": "image/png" },
      url: "http://localhost/upload",
    });
    FakeXMLHttpRequest.instances[0]?.dispatchEvent(new Event("error"));
    await expect(result).rejects.toThrow("Object upload failed");
  });

  it("aborts through AbortSignal", async () => {
    const controller = new AbortController();
    const result = uploadFile({
      file: new File(["x"], "image.webp", { type: "image/webp" }),
      headers: { "Content-Type": "image/webp" },
      signal: controller.signal,
      url: "http://localhost/upload",
    });
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
  });
});
