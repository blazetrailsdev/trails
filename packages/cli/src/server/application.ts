/**
 * Application — wires routes, controllers, and the Rack-compatible dispatch.
 *
 * Loads the user's routes file, discovers controllers, and builds a
 * RouteSet dispatcher that instantiates controllers and calls actions.
 */

import * as path from "node:path";
import * as fs from "node:fs";
import { pathToFileURL } from "node:url";

import type { RackEnv, RackResponse } from "@rails-ts/rack";
import { bodyFromString } from "@rails-ts/rack";
import { RouteSet, Mapper, Request, Response, ActionController } from "@rails-ts/actionpack";

export interface ApplicationOptions {
  cwd: string;
}

export class Application {
  private cwd: string;
  private routeSet: RouteSet = new RouteSet();
  private controllerCache: Map<string, typeof ActionController.Base> = new Map();

  constructor(options: ApplicationOptions) {
    this.cwd = options.cwd;
  }

  /**
   * Initialize the application: load routes and set up the dispatcher.
   */
  async initialize(): Promise<void> {
    await this.loadRoutes();
    this.routeSet.setDispatcher(this.dispatch.bind(this));
  }

  /**
   * Handle a Rack env and return a Rack response.
   */
  async call(env: RackEnv): Promise<RackResponse> {
    return this.routeSet.call(env);
  }

  /**
   * Get the route set for inspection (e.g., `rails-ts routes`).
   */
  getRouteSet(): RouteSet {
    return this.routeSet;
  }

  /**
   * Load routes from the user's src/config/routes.ts (compiled to dist/).
   */
  private async loadRoutes(): Promise<void> {
    // Try dist first (compiled), then src (ts-node/tsx)
    const candidates = [
      path.join(this.cwd, "dist", "config", "routes.js"),
      path.join(this.cwd, "src", "config", "routes.ts"),
    ];

    let routesModule: any;
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        const fileUrl = pathToFileURL(candidate).href;
        routesModule = await import(fileUrl);
        break;
      }
    }

    if (!routesModule?.drawRoutes) {
      console.warn("  Warning: No routes file found or drawRoutes not exported.");
      return;
    }

    this.routeSet.draw((mapper: Mapper) => {
      routesModule.drawRoutes(mapper);
    });
  }

  /**
   * Dispatcher: resolve controller class, instantiate, dispatch action.
   */
  private async dispatch(
    controllerName: string,
    action: string,
    params: Record<string, string>,
    env: RackEnv
  ): Promise<RackResponse> {
    try {
      const ControllerClass = await this.resolveController(controllerName);

      const request = new Request(env);
      const response = new Response();

      const controller = new ControllerClass();
      await controller.dispatch(action, request, response);

      return controller.toRackResponse();
    } catch (err: any) {
      if (err.name === "ActionNotFound") {
        return [
          404,
          { "content-type": "text/plain" },
          bodyFromString(`Action '${action}' not found on ${controllerName} controller`),
        ];
      }

      console.error(`  Error dispatching ${controllerName}#${action}:`, err.message);
      return [
        500,
        { "content-type": "text/html; charset=utf-8" },
        bodyFromString(this.errorPage(err)),
      ];
    }
  }

  /**
   * Resolve a controller name (e.g., "todos") to its class.
   * Looks in src/app/controllers/{name}-controller.ts (or dist/).
   */
  private async resolveController(name: string): Promise<any> {
    if (this.controllerCache.has(name)) {
      return this.controllerCache.get(name)!;
    }

    const dasherized = name.replace(/_/g, "-");
    const candidates = [
      path.join(this.cwd, "dist", "app", "controllers", `${dasherized}-controller.js`),
      path.join(this.cwd, "src", "app", "controllers", `${dasherized}-controller.ts`),
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        const fileUrl = pathToFileURL(candidate).href;
        const mod = await import(fileUrl);

        // Find the controller class — look for *Controller export
        for (const [exportName, exportValue] of Object.entries(mod)) {
          if (
            exportName.endsWith("Controller") &&
            typeof exportValue === "function"
          ) {
            this.controllerCache.set(name, exportValue as any);
            return exportValue;
          }
        }
      }
    }

    throw new Error(
      `Controller not found: ${name}. ` +
      `Expected a file at src/app/controllers/${dasherized}-controller.ts`
    );
  }

  /**
   * Generate a development error page.
   */
  private errorPage(err: Error): string {
    return `<!DOCTYPE html>
<html>
<head><title>Error</title>
<style>
  body { font-family: monospace; margin: 2em; background: #1a1a2e; color: #e0e0e0; }
  h1 { color: #e74c3c; }
  pre { background: #16213e; padding: 1em; border-radius: 4px; overflow-x: auto; }
</style>
</head>
<body>
  <h1>${err.name || "Error"}: ${escapeHtml(err.message)}</h1>
  <pre>${escapeHtml(err.stack || "")}</pre>
</body>
</html>`;
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
