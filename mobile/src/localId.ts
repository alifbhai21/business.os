/**
 * Generates a client-side unique identifier for offline-first records.
 * The server uses this as the idempotency key per (business, localId) so a
 * retried offline request never creates a second financial effect.
 */
export function newLocalId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}