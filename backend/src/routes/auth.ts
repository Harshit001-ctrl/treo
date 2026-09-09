import { Router } from "express";
import { z } from "zod";
import { User } from "../db/models/User";
import { hashPassword, verifyPassword } from "../auth/password";
import { signSession, sessionCookieOptions, SESSION_COOKIE } from "../auth/jwt";
import { asyncHandler } from "../middleware/asyncHandler";
import { requireAuth } from "../middleware/requireAuth";
import { conflict, unauthorized } from "../lib/httpError";

export const authRouter = Router();

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

authRouter.post(
  "/register",
  asyncHandler(async (req, res) => {
    const { email, password } = credentialsSchema.parse(req.body);

    const existing = await User.findOne({ email });
    if (existing) throw conflict("EMAIL_TAKEN", "An account with that email already exists.");

    const passwordHash = await hashPassword(password);
    const user = await User.create({ email, passwordHash });

    const token = signSession({ userId: user._id.toString() });
    res.cookie(SESSION_COOKIE, token, sessionCookieOptions());
    res.status(201).json({ id: user._id, email: user.email });
  })
);

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password } = credentialsSchema.parse(req.body);

    const user = await User.findOne({ email });
    // Same error for "no such user" and "wrong password" — don't leak which one.
    const invalidCredentials = () => unauthorized("Invalid email or password.");
    if (!user) throw invalidCredentials();

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) throw invalidCredentials();

    const token = signSession({ userId: user._id.toString() });
    res.cookie(SESSION_COOKIE, token, sessionCookieOptions());
    res.json({ id: user._id, email: user.email });
  })
);

authRouter.post("/logout", (_req, res) => {
  const { maxAge: _maxAge, ...clearOptions } = sessionCookieOptions();
  res.clearCookie(SESSION_COOKIE, clearOptions);
  res.status(204).end();
});

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.userId).select("email");
    if (!user) throw unauthorized();
    res.json({ id: user._id, email: user.email });
  })
);
