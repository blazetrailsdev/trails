import { getFs, getPath } from "@blazetrails/ruby-compat";
import { createServer, type ViteDevServer } from "vite";
import type { RackApp } from "@blazetrails/actionpack";
import { trailsPlugin } from "./vite-plugin.js";

export interface DevServerOptions {
  port: number;
  host: string;
  cwd: string;
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
    const fs = getFs();
    const path = getPath();
    const tsConfig = path.join(this.cwd, "vite.config.ts");
    const jsConfig = path.join(this.cwd, "vite.config.js");
    const hasTsConfig = await fs.exists(tsConfig);
    const hasViteConfig = hasTsConfig || (await fs.exists(jsConfig));

    const configFile = hasViteConfig ? (hasTsConfig ? tsConfig : jsConfig) : false;

    this.server = await createServer({
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
