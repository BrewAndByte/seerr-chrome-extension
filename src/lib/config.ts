import type { SeerrConfig } from "./types.js";

const STORAGE_KEY = "seerrConfig";

export interface UrlValidationResult {
  ok: boolean;
  normalized: string;
  error?: string;
}

/**
 * Normalizes a user-entered Seerr URL: trims whitespace, strips trailing
 * slashes, and validates it's a well-formed http(s) URL. Does not perform
 * any network access.
 */
export function validateSeerrUrl(input: string): UrlValidationResult {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return { ok: false, normalized: "", error: "Enter your Seerr URL." };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      ok: false,
      normalized: "",
      error: "That doesn't look like a valid URL (e.g. http://192.168.1.10:5055).",
    };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, normalized: "", error: "The URL must start with http:// or https://." };
  }

  const normalized = parsed.origin + parsed.pathname.replace(/\/+$/, "");
  return { ok: true, normalized };
}

/** The origin match pattern to request as a runtime host permission for this URL. */
export function originPatternFor(seerrUrl: string): string {
  return new URL(seerrUrl).origin + "/*";
}

export async function getConfig(): Promise<SeerrConfig | null> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const config = stored[STORAGE_KEY] as SeerrConfig | undefined;
  if (!config || !config.seerrUrl) return null;
  return config;
}

export async function setConfig(config: SeerrConfig): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: config });
}
