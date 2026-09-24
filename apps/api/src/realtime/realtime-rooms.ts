export function sessionRoom(sessionId: string): string {
  return `session:${sessionId}`;
}

export function userRoom(userId: string): string {
  return `user:${userId}`;
}

export function tripRoom(tripId: string): string {
  return `trip:${tripId}`;
}
