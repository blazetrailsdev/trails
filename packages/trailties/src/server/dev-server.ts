import { getFsAsync, getPathAsync } from "@blazetrails/activesupport";
import { createServer, type ViteDevServer } from "vite";
import type { RackApp } from "@blazetrails/actionpack";
import { trailsPlugin } from "./vite-plugin.js";

export interface DevServerOptions {
  port: number;
  host: string;
  cwd: string;
  /** `run Rails.application` — the booted app's middleware-wrapped endpoint. */
  app?: RackApp;
}

export class DevServer {
  private port: number;
  private host: string;
  private cwd: string;
  private app: RackApp | undefined;
  private server: ViteDevServer | null = null;

  constructor(options: DevServerOptions) {
    this.port = options.port;
    this.host = options.host;
    this.cwd = options.cwd;
    this.app = options.app;
  }

  async start(): Promise<void> {
    const fs = await getFsAsync();
    const path = await getPathAsync();
    const tsConfig = path.join(this.cwd, "vite.config.ts");
    const jsConfig = path.join(this.cwd, "vite.config.js");
    const hasTsConfig = await fs.exists(tsConfig);
    const hasViteConfig = hasTsConfig || (await fs.exists(jsConfig));

    const configFile = hasViteConfig ? (hasTsConfig ? tsConfig : jsConfig) : false;

    this.server = await createServer({
      // Only set root when no config file — the project's vite.config
      // defines its own root (e.g. "app/assets") which should win.
      ...(hasViteConfig ? {} : { root: this.cwd }),
      configFile,
      plugins: this.app ? [trailsPlugin({ app: this.app })] : [],
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
