import http from "node:http";
import os from "node:os";
import { createTutorHandler } from "./handler";

/**
 * Standalone Sensei server: `pnpm sensei` (port 5179). Used by the simulator and by anyone
 * who wants the agent without the Vite dev server. Non-loopback callers need the token.
 */
const port = Number(process.env.SENSEI_PORT || 5179);
const handler = createTutorHandler();

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin ?? "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Sensei-Token");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  const handled = await handler.handle(req, res);
  if (!handled) {
    res.statusCode = 404;
    res.end("Not found");
  }
});

server.listen(port, "0.0.0.0", async () => {
  const lan = Object.values(os.networkInterfaces())
    .flat()
    .find((n) => n && n.family === "IPv4" && !n.internal)?.address;
  const tracing = await handler.tracer.enabled();
  console.log(`Sensei agent listening on http://localhost:${port}`);
  console.log(`  inference: ${handler.creds ? `${handler.creds.provider} (${handler.creds.model})` : "not configured (deterministic answers only)"}`);
  console.log(`  tracing:   ${tracing ? `Agent Lens -> ${handler.tracer.project}` : "off"}`);
  console.log(`  token:     ${handler.token}  (required from any non-localhost address)`);
  if (lan) console.log(`  phone:     http://${lan}:5178/?sensei=${handler.token}  (with pnpm dev:phone running)`);
});

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, async () => {
    await handler.tracer.shutdown();
    server.close(() => process.exit(0));
  });
}
