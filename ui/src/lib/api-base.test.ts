import { describe, expect, it, vi, beforeEach } from "vitest";

describe("api-base", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  describe("API_BASE", () => {
    it("uses VITE_API_URL origin when set", async () => {
      vi.stubEnv("VITE_API_URL", "https://backend.railway.app");
      const { API_BASE } = await import("./api-base");
      expect(API_BASE).toBe("https://backend.railway.app/api");
    });

    it("falls back to /api when VITE_API_URL is unset", async () => {
      // VITE_API_URL not set — import.meta.env.VITE_API_URL is undefined
      const { API_BASE } = await import("./api-base");
      expect(API_BASE).toBe("/api");
    });

    it("falls back to /api when VITE_API_URL is empty string", async () => {
      vi.stubEnv("VITE_API_URL", "");
      const { API_BASE } = await import("./api-base");
      expect(API_BASE).toBe("/api");
    });
  });

  describe("getWsHost", () => {
    it("returns host from VITE_API_URL when set", async () => {
      vi.stubEnv("VITE_API_URL", "https://backend.railway.app");
      const { getWsHost } = await import("./api-base");
      expect(getWsHost()).toBe("backend.railway.app");
    });

    it("returns host with port from VITE_API_URL when port specified", async () => {
      vi.stubEnv("VITE_API_URL", "https://backend.railway.app:8080");
      const { getWsHost } = await import("./api-base");
      expect(getWsHost()).toBe("backend.railway.app:8080");
    });

    it("returns window.location.host when VITE_API_URL is unset", async () => {
      // Mock window.location for node environment
      const originalWindow = (globalThis as any).window;
      (globalThis as any).window = { location: { host: "localhost:3100", protocol: "http:" } };
      try {
        const { getWsHost } = await import("./api-base");
        expect(getWsHost()).toBe("localhost:3100");
      } finally {
        if (originalWindow === undefined) {
          delete (globalThis as any).window;
        } else {
          (globalThis as any).window = originalWindow;
        }
      }
    });
  });
});
