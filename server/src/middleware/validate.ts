import type { Request, Response, NextFunction } from "express";
import type { ZodSchema } from "zod";

export function validate(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    req.body = schema.parse(req.body);
    next();
  };
}

export function validateQuery(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const parsed = schema.parse(req.query);
    // Express 5 defines req.query as a configurable getter — direct assignment throws in strict mode.
    // Redefine the property as a plain value to allow Zod-coerced types (e.g. number) to survive.
    Object.defineProperty(req, "query", {
      value: parsed as typeof req.query,
      writable: true,
      configurable: true,
      enumerable: true,
    });
    next();
  };
}
