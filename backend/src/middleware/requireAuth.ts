import { NextFunction, Request, Response } from "express";
import { readSessionToken, verifySession } from "../auth/jwt";
import { unauthorized } from "../lib/httpError";

/** A missing, expired, or tampered session cookie all fail the same way: 401
 * with a message the frontend maps to "please log in again," per the brief's
 * "sensible handling of expired or invalid sessions." */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const payload = verifySession(readSessionToken(req));
  if (!payload) return next(unauthorized("Your session has expired. Please log in again."));
  req.userId = payload.userId;
  next();
}
