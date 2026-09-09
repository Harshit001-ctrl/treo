import jwt from "jsonwebtoken";
import { CookieOptions, Request } from "express";
import { env } from "../config/env";

export const SESSION_COOKIE = "session";
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

export interface SessionPayload {
  userId: string;
}

export function signSession(payload: SessionPayload): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: SESSION_TTL_SECONDS });
}

/** Returns null (never throws) for a missing, expired, or tampered token —
 * callers decide what "no valid session" means for their route. */
export function verifySession(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  try {
    return jwt.verify(token, env.jwtSecret) as SessionPayload;
  } catch {
    return null;
  }
}

export function sessionCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.isProduction,
    // Frontend (Vercel) and backend (Render) are different origins in
    // production, so a cross-site cookie needs SameSite=None (+ Secure,
    // required by browsers to honour None). Locally they're same-site
    // (same "localhost", different port only), so Lax works without HTTPS.
    sameSite: env.isProduction ? "none" : "lax",
    maxAge: SESSION_TTL_SECONDS * 1000,
    path: "/",
  };
}

export function readSessionToken(req: Request): string | undefined {
  return req.cookies?.[SESSION_COOKIE];
}
