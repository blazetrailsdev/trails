/**
 * Trails-private support for `ActionDispatch::Routing::RouteSet::Dispatcher`
 * — a controller-name → handler registry consulted at dispatch time.
 * Rails resolves a controller *class* from `req.controller_class`; trails
 * has no ActionController port yet, so the registry holds string-keyed
 * handler callbacks instead. The matching `Dispatcher` / `StaticDispatcher`
 * endpoint classes live in `route-set.ts` to mirror Rails' inner-class layout.
 *
 * @internal trails-private (no Rails counterpart as a standalone file)
 */

import type { RackEnv, RackResponse } from "@blazetrails/rack";
import { RoutingError } from "../../action-controller/metal/exceptions.js";
import { Request } from "../http/request.js";
import type { Response } from "../http/response.js";
import type { RackishResponse, RouterRequest } from "../journey/router.js";
import type { DispatcherCallback } from "./route-set.js";

/** @internal */
export type DispatchHandler = (action: string, req: RouterRequest) => RackishResponse;

/** @internal */
export class DispatcherRegistry {
  private readonly handlers = new Map<string, DispatchHandler>();

  register(controller: string, handler: DispatchHandler): void {
    this.handlers.set(controller, handler);
  }

  unregister(controller: string): void {
    this.handlers.delete(controller);
  }

  has(controller: string): boolean {
    return this.handlers.has(controller);
  }

  /** @internal */
  resolve(controller: string): DispatchHandler | undefined {
    return this.handlers.get(controller);
  }

  clear(): void {
    this.handlers.clear();
  }
}

/**
 * The controller class shape `Dispatcher#dispatch` needs. Declared
 * structurally rather than as `ActionController::Base` so `action_dispatch`
 * keeps no import edge on `action_controller` — Rails gets the same
 * decoupling from `req.controller_class` returning whatever the constant
 * table holds.
 *
 * @internal
 */
export interface DispatchableControllerClass {
  new (): {
    dispatch(action: string, req: Request, res: Response): Promise<unknown>;
    toRackResponse(): RackResponse;
  };
  makeResponseBang(request: Request): Response;
}

/**
 * Port of `ActionDispatch::Routing::RouteSet::Dispatcher#serve` / `#controller`
 * / `#dispatch` (`route_set.rb:46-62`) over an explicit constant table:
 * resolve the controller class the way `Request#controller_class_for`
 * (`http/request.rb:94-110`) resolves `"#{name.camelize}Controller"`, raise
 * `ActionController::RoutingError` when it is missing, `make_response!`, then
 * `controller.dispatch(action, req, res)`.
 *
 * Rails attaches a `Dispatcher` per route in the mapper (`mapper.rb:297`);
 * `RouteSet#call` takes one callback for the whole set, so this returns the
 * callback rather than an endpoint — see the
 * `converge-routeset-setdispatcher-to-per-route-dispatcher` story.
 *
 * @internal
 */
export function controllerDispatcher(
  controllers: Map<string, DispatchableControllerClass>,
): DispatcherCallback {
  return async (controllerName: string, action: string, _params, env: RackEnv) => {
    const controllerClass = controllers.get(controllerName);
    if (!controllerClass) {
      throw new RoutingError(`uninitialized constant ${controllerName}`);
    }
    const req = new Request(env);
    const res = controllerClass.makeResponseBang(req);
    const controller = new controllerClass();
    await controller.dispatch(action, req, res);
    return controller.toRackResponse();
  };
}
