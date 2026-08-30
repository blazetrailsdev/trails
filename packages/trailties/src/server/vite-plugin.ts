/**
 * Vite plugin that bridges Vite's Connect-style middleware to the
 * trails Rack application.  Every request that isn't handled by Vite's
 * own asset pipeline (HMR websocket, /@vite/*, static files in /public)
 * falls through to the Rack app — just like Puma sits behind Rack in Rails.
 *
 * The bridge itself is `Rack::Handler::Node` — Vite's middleware stack takes
 * the place of the `node:http` server the handler would otherwise create, so
 * the servlet's `service(req, res)` is all that is called here, exactly as
 * WEBrick calls it once the servlet is mounted.
 */

import type { Plugin, ViteDevServer } from "vite";
import { Handler } from "@blazetrails/rack";
import type { HttpRequest, HttpResponse } from "@blazetrails/activesupport";
import type { RackApp } from "@blazetrails/actionpack";

export interface TrailsPluginOptions {
  /** The booted `Trails.application` Rack endpoint — `run Rails.application`. */
  app: RackApp;
}

export function trailsPlugin(options: TrailsPluginOptions): Plugin {
  const handler = new Handler.Node(options.app);

  return {
    name: "trails",
    enforce: "post",

    configureServer(server: ViteDevServer) {
      // Return a function so this middleware runs *after* Vite's built-in
      // middleware (static files, HMR, etc.) — unhandled requests hit Rack.
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
