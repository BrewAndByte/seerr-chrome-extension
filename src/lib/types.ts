/** Persisted extension configuration (chrome.storage.local). */
export interface SeerrConfig {
  /** Normalized base URL, no trailing slash, e.g. "http://192.168.1.10:5055". */
  seerrUrl: string;
  /** Seerr "API Key" from Settings -> General. Required for authenticated calls. */
  apiKey: string;
}

/** Seerr's mediaInfo.status enum (see Seerr/Overseerr MediaStatus). */
export const enum MediaStatus {
  UNKNOWN = 1,
  PENDING = 2,
  PROCESSING = 3,
  AVAILABLE = 4,
  PARTIALLY_AVAILABLE = 5,
}

export interface SeerrMediaInfo {
  id: number;
  status: MediaStatus;
  status4k?: MediaStatus;
}

/** A single item from /api/v1/search, narrowed to the fields this extension uses. */
export interface SeerrSearchResult {
  id: number;
  mediaType: "movie" | "tv" | "person";
  title?: string; // movies
  name?: string; // tv
  overview?: string;
  posterPath?: string | null;
  releaseDate?: string; // movies, "YYYY-MM-DD"
  firstAirDate?: string; // tv, "YYYY-MM-DD"
  mediaInfo?: SeerrMediaInfo;
}

export interface SeerrSearchResponse {
  page: number;
  totalPages: number;
  totalResults: number;
  results: SeerrSearchResult[];
}

/** Normalized shape the results UI actually renders. */
export interface DisplayResult {
  id: number;
  mediaType: "movie" | "tv";
  title: string;
  year: string | null;
  overview: string;
  posterUrl: string | null;
  status: MediaStatus | null;
  detailUrl: string;
}

/** A single season entry from /api/v1/tv/{id}, narrowed to what the request modal needs. */
export interface SeerrSeason {
  seasonNumber: number;
  episodeCount: number;
  name?: string;
}

/** Body for POST /api/v1/request. */
export interface RequestPayload {
  mediaId: number;
  mediaType: "movie" | "tv";
  seasons?: number[];
}

export type SeerrErrorKind =
  | "not_configured"
  | "invalid_url"
  | "permission_denied"
  | "network"
  | "timeout"
  | "unauthorized"
  | "http_error"
  | "malformed_response"
  | "empty_query"
  | "no_results";

export class SeerrError extends Error {
  readonly kind: SeerrErrorKind;
  constructor(kind: SeerrErrorKind, message: string) {
    super(message);
    this.kind = kind;
    this.name = "SeerrError";
  }
}
