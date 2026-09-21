type UploadFileOptions = Readonly<{
  file: File;
  headers: Readonly<Record<string, string>>;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
  url: string;
}>;

export function uploadFile({
  file,
  headers,
  onProgress,
  signal,
  url,
}: UploadFileOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    const abort = () => request.abort();
    const cleanup = () => signal?.removeEventListener("abort", abort);

    request.open("PUT", url);
    for (const [name, value] of Object.entries(headers)) {
      request.setRequestHeader(name, value);
    }
    request.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable || event.total === 0) return;
      onProgress?.(Math.round((event.loaded / event.total) * 100));
    });
    request.addEventListener("load", () => {
      cleanup();
      if (request.status >= 200 && request.status < 300) resolve();
      else reject(new Error(`Object upload failed with status ${request.status}`));
    });
    request.addEventListener("error", () => {
      cleanup();
      reject(new Error("Object upload failed"));
    });
    request.addEventListener("abort", () => {
      cleanup();
      reject(new DOMException("Upload cancelled", "AbortError"));
    });
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) {
      request.abort();
      return;
    }
    request.send(file);
  });
}
