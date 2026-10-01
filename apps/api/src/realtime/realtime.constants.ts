export const SOCKET_PATH = "/socket.io";
export const SOCKET_STREAM_NAME = "tripforge:socketio";
export const SOCKET_STREAM_MAX_LENGTH = 10_000;
export const SOCKET_MAX_HTTP_BUFFER_BYTES = 64 * 1024;
export const MAX_SESSION_TIMER_MS = 24 * 60 * 60 * 1_000;

export const SOCKET_AUTH_ERROR = {
  code: "AUTHENTICATION_REQUIRED",
  message: "Authentication is required",
} as const;
