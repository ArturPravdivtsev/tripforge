export type NotificationCursor = Readonly<{
  v: 1;
  createdAt: string;
  id: string;
}>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class InvalidNotificationCursorError extends Error {}

export function encodeNotificationCursor(cursor: NotificationCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeNotificationCursor(value: string): NotificationCursor {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length > 512) {
    throw new InvalidNotificationCursorError();
  }

  try {
    const decoded: unknown = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    );
    if (!isCursor(decoded)) throw new InvalidNotificationCursorError();
    return decoded;
  } catch (error) {
    if (error instanceof InvalidNotificationCursorError) throw error;
    throw new InvalidNotificationCursorError();
  }
}

function isCursor(value: unknown): value is NotificationCursor {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Partial<Record<keyof NotificationCursor, unknown>>;
  if (
    Object.keys(value).length !== 3 ||
    candidate.v !== 1 ||
    typeof candidate.createdAt !== "string" ||
    typeof candidate.id !== "string" ||
    !UUID_PATTERN.test(candidate.id)
  ) {
    return false;
  }
  const date = new Date(candidate.createdAt);
  return !Number.isNaN(date.getTime()) && date.toISOString() === candidate.createdAt;
}
