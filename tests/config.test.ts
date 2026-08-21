import { beforeEach, describe, expect, it, vi } from "vitest";
import { getConfig, originPatternFor, setConfig, validateSeerrUrl } from "../src/lib/config.js";

describe("validateSeerrUrl", () => {
  it("accepts a plain http URL with a port", () => {
    const result = validateSeerrUrl("http://192.168.1.10:5055");
    expect(result.ok).toBe(true);
    expect(result.normalized).toBe("http://192.168.1.10:5055");
  });

  it("strips trailing slashes", () => {
    const result = validateSeerrUrl("http://192.168.1.10:5055///");
    expect(result.ok).toBe(true);
    expect(result.normalized).toBe("http://192.168.1.10:5055");
  });

  it("trims surrounding whitespace", () => {
    const result = validateSeerrUrl("   https://seerr.example.com  ");
    expect(result.ok).toBe(true);
    expect(result.normalized).toBe("https://seerr.example.com");
  });

  it("rejects an empty value", () => {
    const result = validateSeerrUrl("");
    expect(result.ok).toBe(false);
  });

  it("rejects a non-URL string", () => {
    const result = validateSeerrUrl("not a url");
    expect(result.ok).toBe(false);
  });

  it("rejects non-http(s) schemes", () => {
    const result = validateSeerrUrl("ftp://example.com");
    expect(result.ok).toBe(false);
  });
});

describe("originPatternFor", () => {
  it("builds a Chrome match pattern from a URL's origin", () => {
    expect(originPatternFor("http://192.168.1.10:5055")).toBe("http://192.168.1.10:5055/*");
  });
});

describe("getConfig / setConfig", () => {
  beforeEach(() => {
    const store: Record<string, unknown> = {};
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: vi.fn((key: string) => Promise.resolve(key in store ? { [key]: store[key] } : {})),
          set: vi.fn((items: Record<string, unknown>) => {
            Object.assign(store, items);
            return Promise.resolve();
          }),
        },
      },
    });
  });

  it("returns null when nothing has been saved", async () => {
    expect(await getConfig()).toBeNull();
  });

  it("round-trips a saved config", async () => {
    await setConfig({ seerrUrl: "http://192.168.1.10:5055", apiKey: "secret-key" });
    expect(await getConfig()).toEqual({
      seerrUrl: "http://192.168.1.10:5055",
      apiKey: "secret-key",
    });
  });
});
