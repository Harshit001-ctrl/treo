import mongoose from "mongoose";
import { env } from "../config/env";

let connectPromise: Promise<typeof mongoose> | null = null;

/** Idempotent — safe to call from every request path and from the batch CLI. */
export function connectDb(): Promise<typeof mongoose> {
  if (mongoose.connection.readyState === 1) return Promise.resolve(mongoose);
  if (!connectPromise) {
    connectPromise = mongoose.connect(env.mongoUri).catch((err) => {
      connectPromise = null;
      throw err;
    });
  }
  return connectPromise;
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
  connectPromise = null;
}
