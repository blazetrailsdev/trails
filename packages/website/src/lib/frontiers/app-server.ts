/**
 * Browser-side Rack app server.
 *
 * Runs ActionPack routing + controllers in the sandbox.
 * Controllers render JSON/HTML/plain responses.
 */

import type { RackEnv, RackResponse } from "@blazetrails/rack";
import { bodyFromString } from "@blazetrails/rack";
import { RouteSet, ActionController } from "@blazetrails/actionpack";

export interface AppServerDeps {
  executeCode: (code: string) => Promise<unknown>;
}

export interface AppServer {
  call: (env: RackEnv) => Promise<RackResponse>;
  routes: RouteSet;
  registerController: (name: string, controllerClass: ControllerClass) => void;
  drawRoutes: (fn: (r: any) => void) => void;
}

type ControllerClass = new () => InstanceType<typeof ActionController.Base>;

export function createAppServer(_deps: AppServerDeps): AppServer {
  const routeSet = new RouteSet();

  return {
    routes: routeSet,

    /**
     * The sandbox runs no middleware stack, so an action that raises has no
     * `ShowExceptions` to render it; this stands in for that middleware.
     */
    async call(env: RackEnv): Promise<RackResponse> {
      try {
        return await routeSet.call(env);
      } catch (e: any) {
        return [500, { "content-type": "text/plain" }, bodyFromString(String(e?.message ?? e))];
      }
    },

    registerController(name: string, controllerClass: ControllerClass) {
      routeSet.registerController(name, controllerClass as never);
    },

    drawRoutes(fn: (r: any) => void) {
      routeSet.draw(fn);
    },
  };
}
