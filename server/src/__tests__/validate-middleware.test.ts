import type { NextFunction, Request, Response } from "express";
import { ZodError, z } from "zod";
import { describe, expect, it, vi } from "vitest";
import { validate, validateQuery } from "../middleware/validate.js";

function makeReq(overrides: Partial<{ body: unknown; query: Record<string, unknown> }> = {}): Request {
  return {
    method: "POST",
    originalUrl: "/api/test",
    body: overrides.body ?? {},
    params: {},
    query: overrides.query ?? {},
  } as unknown as Request;
}

function makeRes(): Response {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
  } as unknown as Response;
  (res.status as unknown as ReturnType<typeof vi.fn>).mockReturnValue(res);
  return res;
}

describe("validate", () => {
  it("calls next() and sets req.body to parsed result on valid input", () => {
    const schema = z.object({ name: z.string() });
    const req = makeReq({ body: { name: "ok" } });
    const res = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    validate(schema)(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.body).toEqual({ name: "ok" });
  });

  it("throws ZodError on invalid body", () => {
    const schema = z.object({ name: z.string() });
    const req = makeReq({ body: { name: 123 } });
    const res = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    expect(() => validate(schema)(req, res, next)).toThrowError(ZodError);
    expect(next).not.toHaveBeenCalled();
  });
});

describe("validateQuery", () => {
  it("calls next() and coerces query param to number on valid input", () => {
    const schema = z.object({ limit: z.coerce.number().int().min(1).optional() });
    const req = makeReq({ query: { limit: "50" } });
    const res = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    validateQuery(schema)(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(typeof (req.query as any).limit).toBe("number");
    expect((req.query as any).limit).toBe(50);
  });

  it("throws ZodError on invalid query param", () => {
    const schema = z.object({ limit: z.coerce.number().int().min(1).optional() });
    const req = makeReq({ query: { limit: "abc" } });
    const res = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    expect(() => validateQuery(schema)(req, res, next)).toThrowError(ZodError);
    expect(next).not.toHaveBeenCalled();
  });

  it("allows unknown query params to pass through (passthrough schema)", () => {
    const schema = z.object({ limit: z.coerce.number().optional() }).passthrough();
    const req = makeReq({ query: { limit: "10", agentId: "xyz" } });
    const res = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    validateQuery(schema)(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect((req.query as any).limit).toBe(10);
    expect((req.query as any).agentId).toBe("xyz");
  });
});
