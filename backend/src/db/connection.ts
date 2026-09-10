import dns from "node:dns";
import mongoose from "mongoose";
import { env } from "../config/env";

/**
 * A `mongodb+srv://` URI (the format Atlas gives you) needs a DNS SRV lookup
 * before mongoose can even open a socket. On some Windows setups the OS's
 * configured resolver (often a local stub at 127.0.0.1 from a VPN/security
 * tool) answers plain nslookup queries fine but refuses Node's own SRV
 * queries outright — Node then fails before ever reaching Mongo. Pointing
 * Node's resolver at public DNS sidesteps that without needing the user to
 * reconfigure their OS or swap to a non-SRV connection string.
 */
dns.setServers(["8.8.8.8", "1.1.1.1", ...dns.getServers()]);

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
