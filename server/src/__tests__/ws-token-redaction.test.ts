import { describe, expect, it } from "vitest";
import { sanitizeLogUrl } from "../middleware/logger.js";

describe("sanitizeLogUrl", () => {
  it("strips ?token= from a URL with only a token param", () => {
    const input = "/api/companies/abc/events/ws?token=eyJhbGciOiJIUz.secret.value";
    expect(sanitizeLogUrl(input)).toBe("/api/companies/abc/events/ws");
  });

  it("strips token= while preserving other query params", () => {
    const input = "/api/companies/abc/events/ws?token=secret123&debug=true";
    expect(sanitizeLogUrl(input)).toBe("/api/companies/abc/events/ws?debug=true");
  });

  it("strips token= when it appears after another param", () => {
    const input = "/api/companies/abc/events/ws?debug=true&token=secret123";
    expect(sanitizeLogUrl(input)).toBe("/api/companies/abc/events/ws?debug=true");
  });

  it("returns URL unchanged when no token param exists", () => {
    const input = "/api/companies/abc/events/ws?debug=true";
    expect(sanitizeLogUrl(input)).toBe("/api/companies/abc/events/ws?debug=true");
  });

  it("returns URL unchanged when no query string exists", () => {
    const input = "/api/companies/abc/events/ws";
    expect(sanitizeLogUrl(input)).toBe("/api/companies/abc/events/ws");
  });

  it("handles empty string input", () => {
    expect(sanitizeLogUrl("")).toBe("");
  });

  it("handles undefined input", () => {
    expect(sanitizeLogUrl(undefined)).toBe("");
  });
});
