import * as http from "node:http";
import { bodyToString } from "@blazetrails/rack";
import type { RackEnv } from "@blazetrails/rack";
import { Application } from "./application.js";

export interface DevServerOptions {
  port: number;
  host: string;
  cwd: string;
}

export class DevServer {
  private port: number;
  private host: string;
  private cwd: string;
  private server: http.Server | null = null;
  private app: Application;

  constructor(options: DevServerOptions) {
    this.port = options.port;
    this.host = options.host;
    this.cwd = options.cwd;
    this.app = new Application({ cwd: this.cwd });
  }

  async start(): Promise<void> {
    await this.app.initialize();

    this.server = http.createServer(async (req, res) => {
      const start = Date.now();
      const method = req.method || "GET";
      const url = req.url || "/";

      try {
        const env = await this.buildEnv(req);
        const [status, headers, body] = await this.app.call(env);

        res.writeHead(status, headers);
        const bodyStr = await bodyToString(body);
        res.end(bodyStr);
      } catch (err: any) {
        res.writeHead(500, { "content-type": "text/plain" });
        res.end(`Internal Server Error: ${err.message}`);
      }

      const duration = Date.now() - start;
      const status = res.statusCode;
      console.log(`  ${method} ${url} ${status} (${duration}ms)`);
    });

    return new Promise((resolve) => {
      this.server!.listen(this.port, this.host, () => {
        console.log(`=> Rails-TS development server starting on http://${this.host}:${this.port}`);
        console.log(`=> Ctrl+C to stop`);
        console.log("");
        resolve();
      });
    });
  }

  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  /**
   * Convert a Node.js IncomingMessage into a Rack-compatible env hash.
   */
  private async buildEnv(req: http.IncomingMessage): Promise<RackEnv> {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    const env: RackEnv = {
      REQUEST_METHOD: (req.method || "GET").toUpperCase(),
      PATH_INFO: url.pathname,
      QUERY_STRING: url.search?.slice(1) || "",
      SERVER_NAME: url.hostname,
      SERVER_PORT: String(url.port || this.port),
      HTTP_HOST: req.headers.host || `localhost:${this.port}`,
      REMOTE_ADDR: req.socket.remoteAddress || "127.0.0.1",
      "rack.url_scheme": "http",
      "rack.input": await this.readBody(req),
    };

    // Map HTTP headers to CGI-style env vars
    for (const [key, value] of Object.entries(req.headers)) {
      if (key === "content-type") {
        env["CONTENT_TYPE"] = value;
      } else if (key === "content-length") {
        env["CONTENT_LENGTH"] = value;
      } else {
        const envKey = "HTTP_" + key.toUpperCase().replace(/-/g, "_");
        env[envKey] = value;
      }
    }

    return env;
  }

  /**
   * Read the request body as a string.
   */
  private readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
      req.on("error", reject);
    });
  }
}
