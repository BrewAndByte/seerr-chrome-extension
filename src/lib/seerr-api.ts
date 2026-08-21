import type {
  DisplayResult,
  RequestPayload,
  SeerrConfig,
  SeerrSearchResponse,
  SeerrSearchResult,
  SeerrSeason,
} from "./types.js";
import { SeerrError } from "./types.js";

const REQUEST_TIMEOUT_MS = 10_000;
const TMDB_POSTER_BASE = "https://image.tmdb.org/t/p/w342";

function withTimeout(ms: number): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, cancel: () => clearTimeout(timer) };
}

async function seerrFetch(config: SeerrConfig, path: string, init?: RequestInit): Promise<Response> {
  const { signal, cancel } = withTimeout(REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`${config.seerrUrl}${path}`, {
      ...init,
      headers: {
        ...(config.apiKey ? { "X-Api-Key": config.apiKey } : {}),
        ...(init?.headers as Record<string, string> | undefined),
      },
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new SeerrError("timeout", "The request to Seerr timed out.");
    }
    throw new SeerrError(
      "network",
      "Couldn't reach your Seerr server. Check the URL and that it's running."
    );
  } finally {
    cancel();
  }
}

function yearFromDate(date: string | undefined): string | null {
  if (!date) return null;
  const year = date.slice(0, 4);
  return /^\d{4}$/.test(year) ? year : null;
}

/** Narrows and reshapes a raw search hit into what the results UI actually renders. */
function toDisplayResult(raw: SeerrSearchResult, seerrUrl: string): DisplayResult | null {
  if (raw.mediaType !== "movie" && raw.mediaType !== "tv") return null;

  const title = raw.mediaType === "movie" ? raw.title : raw.name;
  if (!title) return null;

  return {
    id: raw.id,
    mediaType: raw.mediaType,
    title,
    year: yearFromDate(raw.mediaType === "movie" ? raw.releaseDate : raw.firstAirDate),
    overview: raw.overview?.trim() || "No description available.",
    posterUrl: raw.posterPath ? `${TMDB_POSTER_BASE}${raw.posterPath}` : null,
    status: raw.mediaInfo?.status ?? null,
    detailUrl: `${seerrUrl}/${raw.mediaType}/${raw.id}`,
  };
}

/** Puts exact (case-insensitive) title matches first; otherwise preserves Seerr's own ordering. */
function prioritize(results: DisplayResult[], query: string): DisplayResult[] {
  const q = query.trim().toLowerCase();
  return results
    .map((r, index) => ({ r, index }))
    .sort((a, b) => {
      const aExact = a.r.title.toLowerCase() === q ? 0 : 1;
      const bExact = b.r.title.toLowerCase() === q ? 0 : 1;
      if (aExact !== bExact) return aExact - bExact;
      return a.index - b.index;
    })
    .map(({ r }) => r);
}

export interface SearchPage {
  results: DisplayResult[];
  page: number;
  totalPages: number;
  totalResults: number;
}

export async function searchSeerr(
  config: SeerrConfig,
  query: string,
  page = 1
): Promise<SearchPage> {
  const response = await seerrFetch(
    config,
    `/api/v1/search?query=${encodeURIComponent(query)}&page=${page}&language=en`
  );

  if (response.status === 401 || response.status === 403) {
    throw new SeerrError(
      "unauthorized",
      "Seerr rejected the API key. Check it in the extension options."
    );
  }
  if (!response.ok) {
    throw new SeerrError("http_error", `Seerr returned an unexpected error (HTTP ${response.status}).`);
  }

  let data: SeerrSearchResponse;
  try {
    data = (await response.json()) as SeerrSearchResponse;
  } catch {
    throw new SeerrError("malformed_response", "Seerr sent back a response this extension couldn't understand.");
  }

  if (!Array.isArray(data.results)) {
    throw new SeerrError("malformed_response", "Seerr sent back a response this extension couldn't understand.");
  }

  const results = prioritize(
    data.results
      .map((r) => toDisplayResult(r, config.seerrUrl))
      .filter((r): r is DisplayResult => r !== null),
    query
  );

  return {
    results,
    page: data.page ?? page,
    totalPages: data.totalPages ?? 1,
    totalResults: data.totalResults ?? results.length,
  };
}

interface SeerrTvDetailsResponse {
  seasons?: { seasonNumber: number; episodeCount: number; name?: string }[];
}

/** Fetches the requestable (non-special) season list for a TV show, for the season-picker in the request modal. */
export async function getTvSeasons(config: SeerrConfig, tmdbId: number): Promise<SeerrSeason[]> {
  const response = await seerrFetch(config, `/api/v1/tv/${tmdbId}`);

  if (response.status === 401 || response.status === 403) {
    throw new SeerrError(
      "unauthorized",
      "Seerr rejected the API key. Check it in the extension options."
    );
  }
  if (!response.ok) {
    throw new SeerrError("http_error", `Seerr returned an unexpected error (HTTP ${response.status}).`);
  }

  let data: SeerrTvDetailsResponse;
  try {
    data = (await response.json()) as SeerrTvDetailsResponse;
  } catch {
    throw new SeerrError("malformed_response", "Seerr sent back a response this extension couldn't understand.");
  }

  return (data.seasons ?? [])
    .filter((s) => s.seasonNumber > 0 && s.episodeCount > 0)
    .map((s) => ({ seasonNumber: s.seasonNumber, episodeCount: s.episodeCount, name: s.name }));
}

/** Submits a new media request. Throws SeerrError on rejection (bad key, validation failure, etc). */
export async function submitRequest(config: SeerrConfig, payload: RequestPayload): Promise<void> {
  const response = await seerrFetch(config, "/api/v1/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (response.status === 401 || response.status === 403) {
    throw new SeerrError(
      "unauthorized",
      "Seerr rejected the API key. Check it in the extension options."
    );
  }
  if (!response.ok) {
    throw new SeerrError("http_error", `Seerr couldn't process the request (HTTP ${response.status}).`);
  }
}

export interface ConnectionTestResult {
  ok: boolean;
  message: string;
}

/**
 * Two-stage connection test: first confirms the server is reachable at all
 * (unauthenticated /status endpoint), then confirms the API key is valid
 * (/auth/me, which 403s on a bad key).
 */
export async function testConnection(config: SeerrConfig): Promise<ConnectionTestResult> {
  let statusResponse: Response;
  try {
    statusResponse = await seerrFetch(config, "/api/v1/status");
  } catch (err) {
    if (err instanceof SeerrError) {
      return { ok: false, message: err.message };
    }
    throw err;
  }

  if (!statusResponse.ok) {
    return {
      ok: false,
      message: `Reached the server, but it didn't respond like a Seerr instance (HTTP ${statusResponse.status}).`,
    };
  }

  if (!config.apiKey) {
    return { ok: false, message: "Server is reachable, but no API key is set yet." };
  }

  const meResponse = await seerrFetch(config, "/api/v1/auth/me");
  if (meResponse.status === 401 || meResponse.status === 403) {
    return { ok: false, message: "Server is reachable, but the API key was rejected." };
  }
  if (!meResponse.ok) {
    return { ok: false, message: `Server is reachable, but the API key check failed (HTTP ${meResponse.status}).` };
  }

  return { ok: true, message: "Connected successfully." };
}
