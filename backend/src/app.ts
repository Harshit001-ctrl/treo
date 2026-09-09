import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./config/env";
import { authRouter } from "./routes/auth";
import { errorHandler } from "./middleware/errorHandler";

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: env.frontendOrigin,
      credentials: true,
    })
  );
  app.use(cookieParser());
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, env: env.nodeEnv });
  });

  app.use("/api/auth", authRouter);

  // Must be registered last: Express only routes to error middleware that
  // comes after the handler that called next(err).
  app.use(errorHandler);

  return app;
}
