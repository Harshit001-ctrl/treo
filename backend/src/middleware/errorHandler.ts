import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { HttpError } from "../lib/httpError";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    return res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      },
    });
  }
  console.error(err);
  return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong." } });
}
