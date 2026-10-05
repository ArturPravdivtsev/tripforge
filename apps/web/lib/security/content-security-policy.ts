const MAPTILER_ORIGIN = "https://api.maptiler.com";

type ContentSecurityPolicyOptions = Readonly<{
  apiOrigin: string;
  development: boolean;
  nonce: string;
  s3UploadOrigin?: string;
}>;

export function buildContentSecurityPolicy({
  apiOrigin,
  development,
  nonce,
  s3UploadOrigin,
}: ContentSecurityPolicyOptions): string {
  const api = exactHttpOrigin(apiOrigin, "NEXT_PUBLIC_API_URL");
  const socket = websocketOrigin(api);
  const upload = s3UploadOrigin
    ? exactHttpOrigin(s3UploadOrigin, "S3_UPLOAD_ORIGIN")
    : undefined;
  const directives = [
    ["default-src", "'self'"],
    [
      "script-src",
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...(development ? ["'unsafe-eval'"] : []),
    ],
    // MapLibre and React position interactive elements with style attributes.
    ["style-src", "'self'", "'unsafe-inline'"],
    ["img-src", "'self'", "blob:", "data:", MAPTILER_ORIGIN],
    ["font-src", "'self'", "data:", MAPTILER_ORIGIN],
    [
      "connect-src",
      "'self'",
      api,
      socket,
      MAPTILER_ORIGIN,
      ...(upload ? [upload] : []),
    ],
    ["worker-src", "'self'", "blob:"],
    ["object-src", "'none'"],
    ["base-uri", "'self'"],
    ["form-action", "'self'"],
    ["frame-ancestors", "'none'"],
    ["frame-src", "'none'"],
    ["manifest-src", "'self'"],
  ];

  return directives.map((directive) => `${directive.join(" ")};`).join(" ");
}

function exactHttpOrigin(value: string, name: string): string {
  try {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.origin !== value ||
      url.hostname.includes("*")
    ) {
      throw new Error();
    }
    return value;
  } catch {
    throw new Error(`${name} must be an exact HTTP origin`);
  }
}

function websocketOrigin(httpOrigin: string): string {
  const url = new URL(httpOrigin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.origin;
}
