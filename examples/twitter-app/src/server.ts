import * as http from "node:http";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { RackEnv, RackResponse } from "@blazetrails/rack";
import { bodyToString } from "@blazetrails/rack";
import { Static } from "@blazetrails/actionpack";
import { boot } from "./config/application.js";

export const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Wrap the booted Rack app in a Node HTTP server.
 *
 * TODO(0104-twitter-app-full-stack-integration/no-rack-node-http-handler):
 * every trails app needs this bridge and none is shipped — Rack has no
 * `Rack::Handler` equivalent, so the only copy in the repo is inlined in
 * `trailties/src/server/vite-plugin.ts`.
 */
export async function listen(port = 0, host = "127.0.0.1"): Promise<http.Server> {
  const booted = await boot();
  const app = withStaticFiles((env) => booted(env));

  const server = http.createServer((req, res) => {
    void (async () => {
      try {
        const [status, headers, body] = await app(await buildRackEnv(req, port));
        res.writeHead(status, headers as http.OutgoingHttpHeaders);
        res.end(await bodyToString(body));
      } catch (error) {
        res.writeHead(500, { "content-type": "text/plain" });
        res.end(String((error as Error)?.stack ?? error));
      }
    })();
  });

  await new Promise<void>((resolve) => server.listen(port, host, resolve));
  return server;
}

/**
 * Serve `public/` and `app/assets`, then fall through to the application.
 *
 * TODO(0104-twitter-app-full-stack-integration/no-static-or-asset-pipeline):
 * Rails' default middleware stack mounts `ActionDispatch::Static` on
 * `public/`, and Propshaft serves `app/assets` under `/assets`. Neither is in
 * a trails app's request path, so the stylesheet the `trails new` layout
 * links 404s on a freshly generated app.
 */
function withStaticFiles(app: (env: RackEnv) => Promise<RackResponse>) {
  const assets = new Static(app, {
    root: path.join(APP_ROOT, "src", "app", "assets"),
  });
  const publicFiles = new Static((env) => assets.call(env), {
    root: path.join(APP_ROOT, "public"),
  });
  return (env: RackEnv) => publicFiles.call(env);
}

async function buildRackEnv(req: http.IncomingMessage, port: number): Promise<RackEnv> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const env: RackEnv = {
    REQUEST_METHOD: req.method ?? "GET",
    PATH_INFO: decodeURIComponent(url.pathname),
    QUERY_STRING: url.search.replace(/^\?/, ""),
    SERVER_NAME: url.hostname,
    SERVER_PORT: String(url.port || port || 80),
    "rack.url_scheme": "http",
    "rack.input": await readBody(req),
  };

  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value !== "string") continue;
    const upper = key.toUpperCase().replace(/-/g, "_");
    if (upper === "CONTENT_TYPE" || upper === "CONTENT_LENGTH") env[upper] = value;
    else env[`HTTP_${upper}`] = value;
  }

  return env;
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

// `node src/server.ts` (or `tsx src/server.ts`) starts the app directly.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? "127.0.0.1";
  listen(port, host).then(() => {
    console.log(`=> twitter-app listening on http://${host}:${port}`);
  });
}
