/**
 * Vite plugin that bridges Vite's Connect-style middleware to the
 * trails Rack application.  Every request that isn't handled by Vite's
 * own asset pipeline (HMR websocket, /@vite/*, static files in /public)
 * falls through to the Rack app — just like Puma sits behind Rack in Rails.
 */

import type { Plugin, ViteDevServer } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";
import { bodyToString } from "@blazetrails/rack";
import type { RackEnv } from "@blazetrails/rack";
import { Application } from "./application.js";

export interface TrailsPluginOptions {
  cwd?: string;
}

export function trailsPlugin(options: TrailsPluginOptions = {}): Plugin {
  const cwd = options.cwd || process.cwd();
  let app: Application;

  return {
    name: "trails",
    enforce: "post",

    async configureServer(server: ViteDevServer) {
      app = new Application({ cwd });
      await app.initialize();

      // Return a function so this middleware runs *after* Vite's built-in
      // middleware (static files, HMR, etc.) — unhandled requests hit Rack.
      return () => {
        server.middlewares.use(
          async (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => {
            try {
              const address = server.httpServer?.address();
              const actualPort =
                address && typeof address === "object"
                  ? address.port
                  : (server.config.server.port ?? 3000);
              const env = await buildRackEnv(req, actualPort);
              const [status, headers, body] = await app.call(env);

              res.writeHead(status, headers);
              res.end(await bodyToString(body));
            } catch (err: any) {
              next(err);
            }
          },
        );
      };
    },
  };
}

export async function buildRackEnv(req: IncomingMessage, port: number): Promise<RackEnv> {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  const isTLS = "encrypted" in req.socket && (req.socket as any).encrypted;
  const forwardedProtoRaw = req.headers["x-forwarded-proto"];
  const forwardedProtos = Array.isArray(forwardedProtoRaw)
    ? forwardedProtoRaw.join(",")
    : forwardedProtoRaw || "";
  const isForwardedHttps = forwardedProtos
    .split(",")
    .some((p) => p.trim().toLowerCase() === "https");
  const scheme = isTLS || isForwardedHttps ? "https" : "http";

  const env: RackEnv = {
    REQUEST_METHOD: (req.method || "GET").toUpperCase(),
    PATH_INFO: url.pathname,
    QUERY_STRING: url.search?.slice(1) || "",
    SERVER_NAME: url.hostname,
    SERVER_PORT: String(url.port || port),
    HTTP_HOST: req.headers.host || `localhost:${port}`,
    REMOTE_ADDR: req.socket.remoteAddress || "127.0.0.1",
    "rack.url_scheme": scheme,
    "rack.input": await readBody(req),
  };

  for (const [key, rawValue] of Object.entries(req.headers)) {
    if (rawValue === undefined) continue;
    const value = Array.isArray(rawValue) ? rawValue.join(", ") : rawValue;
    if (key === "content-type") {
      env["CONTENT_TYPE"] = value;
    } else if (key === "content-length") {
      env["CONTENT_LENGTH"] = value;
    } else {
      env["HTTP_" + key.toUpperCase().replace(/-/g, "_")] = value;
    }
  }

  return env;
}

const MAX_BODY_SIZE = 10 * 1024 * 1024; // 10 MB

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalLength = 0;
    req.on("data", (chunk: Buffer) => {
      totalLength += chunk.length;
      if (totalLength > MAX_BODY_SIZE) {
        req.destroy();
        reject(new Error("Request body too large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}
