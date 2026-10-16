import type { InlineConfig, ViteDevServer } from "vite";
import { Handler, type RackMiddleware } from "@blazetrails/rack";
import type { HttpRequest, HttpResponse } from "@blazetrails/ruby-compat";

/** @noRailsEquivalent PERMANENT */
export const vite: {
  app: RackMiddleware | undefined;
  config: InlineConfig & { server: NonNullable<InlineConfig["server"]> };
  server: ViteDevServer | undefined;
  url: string | undefined;
} = {
  app: undefined,
  config: { server: { host: "127.0.0.1", port: 0 } },
  server: undefined,
  url: undefined,
};

export class Server {
  static silencePuma = false;

  async run(): Promise<void> {
    await this.setup();
  }

  /** @internal */
  private async setup(): Promise<void> {
    await this.setServer();
    this.setPort();
  }

  /** @internal */
  private async setServer(): Promise<void> {
    if (vite.server === undefined) {
      const { createServer } = await import("vite");
      const server = await createServer({
        configFile: false,
        ...vite.config,
        logLevel: (this.constructor as typeof Server).silencePuma ? "silent" : "info",
        plugins: [
          ...(vite.config.plugins ?? []),
          {
            name: "trails-system-testing",
            configureServer(server: ViteDevServer) {
              return () => {
                server.middlewares.use(async (req, res, next) => {
                  try {
                    await new Handler.Node(vite.app!).service(
                      req as unknown as HttpRequest,
                      res as unknown as HttpResponse,
                    );
                  } catch (err: unknown) {
                    next(err);
                  }
                });
              };
            },
          },
        ],
      });
      vite.server = await server.listen();
    }
  }

  /** @internal */
  private setPort(): void {
    vite.url = vite.server!.resolvedUrls!.local[0];
  }
}
