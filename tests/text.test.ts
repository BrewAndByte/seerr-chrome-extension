import { describe, expect, it } from "vitest";
import { MAX_QUERY_LENGTH, checkQuery, normalizeSelection } from "../src/lib/text.js";

describe("normalizeSelection", () => {
  it("trims and collapses whitespace/newlines", () => {
    expect(normalizeSelection("  The   Last\nof Us  ")).toBe("The Last of Us");
  });

  it("returns empty string for null/undefined", () => {
    expect(normalizeSelection(null)).toBe("");
    expect(normalizeSelection(undefined)).toBe("");
  });
});

describe("checkQuery", () => {
  it("accepts a normal selection", () => {
    const result = checkQuery("Breaking Bad");
    expect(result.ok).toBe(true);
    expect(result.query).toBe("Breaking Bad");
  });

  it("rejects an empty/whitespace-only selection", () => {
    const result = checkQuery("   \n  ");
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("empty");
  });

  it("rejects text over the max query length", () => {
    const result = checkQuery("x".repeat(MAX_QUERY_LENGTH + 1));
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("too_long");
  });

  it("accepts text exactly at the max query length", () => {
    const result = checkQuery("x".repeat(MAX_QUERY_LENGTH));
    expect(result.ok).toBe(true);
  });
});
