import { createApp } from "./app";
import { env } from "./config/env";
import { connectDb } from "./db/connection";

async function main() {
  await connectDb();
  const app = createApp();
  app.listen(env.port, () => {
    console.log(`Backend listening on http://localhost:${env.port} (${env.nodeEnv})`);
  });
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
