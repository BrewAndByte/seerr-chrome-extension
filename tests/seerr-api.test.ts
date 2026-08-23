import { beforeEach, describe, expect, it, vi } from "vitest";
import { getServers, searchSeerr, testConnection } from "../src/lib/seerr-api.js";
import { MediaStatus, SeerrError } from "../src/lib/types.js";

const config = { seerrUrl: "http://192.168.1.10:5055", apiKey: "test-key" };

function fakeResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

describe("searchSeerr", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("maps and filters a successful response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      fakeResponse(200, {
        page: 1,
        totalPages: 1,
        totalResults: 2,
        results: [
          {
            id: 157336,
            mediaType: "movie",
            title: "Interstellar",
            overview: "A space movie.",
            posterPath: "/poster.jpg",
            releaseDate: "2014-11-05",
            mediaInfo: { id: 1, status: MediaStatus.AVAILABLE },
          },
          {
            id: 999,
            mediaType: "person",
            name: "Someone Irrelevant",
          },
        ],
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const page = await searchSeerr(config, "Interstellar");

    expect(page.results).toHaveLength(1);
    expect(page.results[0]).toMatchObject({
      id: 157336,
      mediaType: "movie",
      title: "Interstellar",
      year: "2014",
      posterUrl: "https://image.tmdb.org/t/p/w342/poster.jpg",
      status: MediaStatus.AVAILABLE,
      detailUrl: "http://192.168.1.10:5055/movie/157336",
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/v1/search?query=Interstellar");
    expect((init.headers as Record<string, string>)["X-Api-Key"]).toBe("test-key");
  });

  it("puts an exact title match first even if Seerr ranked it lower", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        fakeResponse(200, {
          page: 1,
          totalPages: 1,
          totalResults: 2,
          results: [
            { id: 1, mediaType: "movie", title: "The Office (UK)", releaseDate: "2001-01-01" },
            { id: 2, mediaType: "tv", name: "The Office", firstAirDate: "2005-03-24" },
          ],
        })
      )
    );

    const page = await searchSeerr(config, "The Office");
    expect(page.results[0]?.title).toBe("The Office");
  });

  it("treats a missing overview as a fallback message rather than blank", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        fakeResponse(200, {
          page: 1,
          totalPages: 1,
          totalResults: 1,
          results: [{ id: 1, mediaType: "movie", title: "No Overview", releaseDate: "2020-01-01" }],
        })
      )
    );

    const page = await searchSeerr(config, "No Overview");
    expect(page.results[0]?.overview).toBe("No description available.");
  });

  it("throws an 'unauthorized' SeerrError on 401", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse(401, {})));
    await expect(searchSeerr(config, "x")).rejects.toMatchObject({ kind: "unauthorized" });
  });

  it("throws an 'http_error' SeerrError on a 500", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse(500, {})));
    await expect(searchSeerr(config, "x")).rejects.toMatchObject({ kind: "http_error" });
  });

  it("throws 'malformed_response' when the body isn't the expected shape", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse(200, { unexpected: true })));
    await expect(searchSeerr(config, "x")).rejects.toMatchObject({ kind: "malformed_response" });
  });

  it("throws 'network' when fetch rejects outright", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(searchSeerr(config, "x")).rejects.toMatchObject({ kind: "network" });
  });

  it("throws 'timeout' when the request is aborted", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("The operation was aborted.", "AbortError"))
    );
    await expect(searchSeerr(config, "x")).rejects.toMatchObject({ kind: "timeout" });
  });
});

describe("getServers", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("maps a multi-server response and flags the default", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      fakeResponse(200, [
        { id: 1, name: "Radarr HD", isDefault: true, is4k: false },
        { id: 2, name: "Radarr Anime", isDefault: false, is4k: false },
      ])
    );
    vi.stubGlobal("fetch", fetchMock);

    const servers = await getServers(config, "movie");

    expect(servers).toEqual([
      { id: 1, name: "Radarr HD", isDefault: true },
      { id: 2, name: "Radarr Anime", isDefault: false },
    ]);
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/v1/service/radarr");
  });

  it("hits the sonarr endpoint for tv", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(200, []));
    vi.stubGlobal("fetch", fetchMock);

    await getServers(config, "tv");

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/v1/service/sonarr");
  });

  it("returns a single-item array unchanged when there's only one server", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(fakeResponse(200, [{ id: 1, name: "Radarr", isDefault: true, is4k: false }]))
    );

    const servers = await getServers(config, "movie");
    expect(servers).toEqual([{ id: 1, name: "Radarr", isDefault: true }]);
  });

  it("filters out 4K servers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        fakeResponse(200, [
          { id: 1, name: "Radarr HD", isDefault: true, is4k: false },
          { id: 2, name: "Radarr 4K", isDefault: false, is4k: true },
        ])
      )
    );

    const servers = await getServers(config, "movie");
    expect(servers).toEqual([{ id: 1, name: "Radarr HD", isDefault: true }]);
  });

  it("throws an 'unauthorized' SeerrError on 401", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse(401, {})));
    await expect(getServers(config, "movie")).rejects.toMatchObject({ kind: "unauthorized" });
  });

  it("throws 'malformed_response' when the body isn't an array", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse(200, { unexpected: true })));
    await expect(getServers(config, "movie")).rejects.toMatchObject({ kind: "malformed_response" });
  });
});

describe("testConnection", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("succeeds when the server is reachable and the key is valid", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes("/api/v1/status")) return Promise.resolve(fakeResponse(200, {}));
      if (url.includes("/api/v1/auth/me")) return Promise.resolve(fakeResponse(200, {}));
      throw new Error(`unexpected url ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await testConnection(config);
    expect(result.ok).toBe(true);
  });

  it("fails with a network message when the server is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const result = await testConnection(config);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/couldn't reach/i);
  });

  it("fails when the server responds but the API key is rejected", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes("/api/v1/status")) return Promise.resolve(fakeResponse(200, {}));
      if (url.includes("/api/v1/auth/me")) return Promise.resolve(fakeResponse(403, {}));
      throw new Error(`unexpected url ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await testConnection(config);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/api key was rejected/i);
  });

  it("fails when no API key has been entered yet", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse(200, {})));
    const result = await testConnection({ seerrUrl: config.seerrUrl, apiKey: "" });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/no api key/i);
  });
});
