import type { Plugin, ViteDevServer } from "vite";
import { Handler } from "@blazetrails/rackup";
import type { HttpRequest, HttpResponse, HttpSocket } from "@blazetrails/ruby-compat";
import type { RackApp } from "@blazetrails/actionpack";

export interface TrailsPluginOptions {
  app: RackApp;
}

export function trailsPlugin(options: TrailsPluginOptions): Plugin {
  let handler!: InstanceType<typeof Handler.Node>;

  return {
    name: "trails",
    enforce: "post",

    async configureServer(server: ViteDevServer) {
      const node = (await Handler.get("node")) as typeof Handler.Node;
      handler = new node(options.app);
      server.httpServer?.on("upgrade", (req, socket, head) => {
        const protocol = req.headers["sec-websocket-protocol"];
        if (protocol === "vite-hmr" || protocol === "vite-ping") return;
        void handler.upgrade(
          req as unknown as HttpRequest,
          socket as unknown as HttpSocket,
          head as Uint8Array,
        );
      });
      return () => {
        server.middlewares.use(async (req, res, next) => {
          try {
            await handler.service(req as unknown as HttpRequest, res as unknown as HttpResponse);
          } catch (err: unknown) {
            next(err);
          }
        });
      };
    },
  };
}
