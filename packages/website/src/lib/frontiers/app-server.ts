/**
 * Browser-side Rack app server.
 *
 * Runs ActionPack routing + controllers in the sandbox.
 * Controllers render JSON/HTML/plain responses.
 */

import type { RackEnv, RackResponse } from "@blazetrails/rack";
import { bodyFromString } from "@blazetrails/rack";
import { RouteSet, Request, Response, ActionController } from "@blazetrails/actionpack";

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
  const controllers = new Map<string, ControllerClass>();

  return {
    routes: routeSet,

    async call(env: RackEnv): Promise<RackResponse> {
      return routeSet.call(env);
    },

    registerController(name: string, controllerClass: ControllerClass) {
      controllers.set(name, controllerClass);
      routeSet.registerController(name, async (action, req): Promise<RackResponse> => {
        const Ctrl = controllers.get(name)!;
        const controller = new Ctrl();
        const request = req as unknown as Request;
        const response = new Response();

        try {
          await controller.dispatch(action, request, response);

          const headers: Record<string, string> = {};
          if (response.headers) {
            Object.assign(headers, response.headers);
          }

          return [response.status, headers, bodyFromString(response.body ?? "")];
        } catch (e: any) {
          return [
            500,
            { "content-type": "text/plain" },
            bodyFromString(`Error in ${name}#${action}: ${e.message}`),
          ];
        }
      });
    },

    drawRoutes(fn: (r: any) => void) {
      routeSet.draw(fn);
    },
  };
}
