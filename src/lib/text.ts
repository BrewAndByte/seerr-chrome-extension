/** Selected text longer than this is rejected rather than sent as a search query. */
export const MAX_QUERY_LENGTH = 200;

/** Collapses internal whitespace/newlines and trims the ends. */
export function normalizeSelection(raw: string | undefined | null): string {
  if (!raw) return "";
  return raw.replace(/\s+/g, " ").trim();
}

export interface QueryCheck {
  query: string;
  ok: boolean;
  reason?: "empty" | "too_long";
}

/** Validates a normalized selection as a search query, without mutating overlong text silently. */
export function checkQuery(raw: string | undefined | null): QueryCheck {
  const query = normalizeSelection(raw);
  if (query.length === 0) {
    return { query, ok: false, reason: "empty" };
  }
  if (query.length > MAX_QUERY_LENGTH) {
    return { query, ok: false, reason: "too_long" };
  }
  return { query, ok: true };
}
