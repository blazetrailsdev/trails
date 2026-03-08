import * as http from "node:http";

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

  constructor(options: DevServerOptions) {
    this.port = options.port;
    this.host = options.host;
    this.cwd = options.cwd;
  }

  async start(): Promise<void> {
    this.server = http.createServer(async (req, res) => {
      const start = Date.now();
      const method = req.method || "GET";
      const url = req.url || "/";

      try {
        // TODO: integrate with Rack middleware stack + ActionDispatch router
        res.writeHead(200, { "content-type": "text/plain" });
        res.end("rails-ts development server");
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
}
