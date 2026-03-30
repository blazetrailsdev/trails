import * as fs from "node:fs";
import * as path from "node:path";
import { createServer, type ViteDevServer } from "vite";
import { trailsPlugin } from "./vite-plugin.js";

export interface DevServerOptions {
  port: number;
  host: string;
  cwd: string;
}

export class DevServer {
  private port: number;
  private host: string;
  private cwd: string;
  private server: ViteDevServer | null = null;

  constructor(options: DevServerOptions) {
    this.port = options.port;
    this.host = options.host;
    this.cwd = options.cwd;
  }

  async start(): Promise<void> {
    const hasViteConfig =
      fs.existsSync(path.join(this.cwd, "vite.config.ts")) ||
      fs.existsSync(path.join(this.cwd, "vite.config.js"));

    const configFile = hasViteConfig
      ? path.join(
          this.cwd,
          fs.existsSync(path.join(this.cwd, "vite.config.ts"))
            ? "vite.config.ts"
            : "vite.config.js",
        )
      : false;

    this.server = await createServer({
      // Only set root when no config file — the project's vite.config
      // defines its own root (e.g. "src/app/assets") which should win.
      ...(hasViteConfig ? {} : { root: this.cwd }),
      configFile,
      plugins: hasViteConfig ? [] : [trailsPlugin({ cwd: this.cwd })],
      server: {
        port: this.port,
        host: this.host,
        strictPort: false,
      },
      logLevel: "warn",
      appType: "custom",
    });

    await this.server.listen();

    const address = this.server.httpServer?.address();
    const actualPort = address && typeof address === "object" ? address.port : this.port;

    console.log(
      `=> Trails application starting in development on http://${this.host}:${actualPort}`,
    );
    console.log(`=> Vite dev server with HMR enabled`);
    console.log(`=> Ctrl+C to stop`);
    console.log("");
  }

  async stop(): Promise<void> {
    if (this.server) {
      await this.server.close();
      this.server = null;
    }
  }
}
