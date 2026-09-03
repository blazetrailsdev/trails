import type { Plugin, ViteDevServer } from "vite";
import { Handler } from "@blazetrails/rack";
import type { HttpRequest, HttpResponse } from "@blazetrails/ruby-compat";
import type { RackApp } from "@blazetrails/actionpack";

export interface TrailsPluginOptions {
  app: RackApp;
}

export function trailsPlugin(options: TrailsPluginOptions): Plugin {
  const handler = new Handler.Node(options.app);

  return {
    name: "trails",
    enforce: "post",

    configureServer(server: ViteDevServer) {
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
