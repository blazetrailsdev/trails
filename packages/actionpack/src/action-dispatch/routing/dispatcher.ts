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
import { X_CASCADE } from "../constants.js";
import { RoutingError } from "../../action-controller/metal/exceptions.js";
import { emptyRackBody, PassNotFound, Request } from "../http/request.js";
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
 * Port of `ActionDispatch::Routing::RouteSet::Dispatcher#serve`
 * (`route_set.rb:46-57`) over an explicit constant table, including the
 * `raise_on_name_error` cascade: a missing controller constant surfaces as
 * `ActionController::RoutingError`, which is re-raised when
 * `raiseOnNameError` is set and otherwise becomes the
 * `[404, X-Cascade: pass, []]` triple that lets routing fall through to the
 * next matching route. Rails picks the flag per route from
 * `defaults.key?(:controller)` (`mapper.rb:301`).
 *
 * Rails attaches a `Dispatcher` per route in the mapper (`mapper.rb:297`);
 * `RouteSet#call` takes one callback for the whole set, so this returns the
 * callback rather than an endpoint — see the
 * `converge-routeset-setdispatcher-to-per-route-dispatcher` story. The
 * callback's `controllerName` / `action` arguments are ignored in favour of
 * `req.path_parameters`, so {@link controllerClass}'s `params[:action] ||=
 * "index"` default (`http/request.rb:88-91`) is the one that applies.
 *
 * `make_response!` is called on whatever {@link controllerClass} returns,
 * unconditionally, exactly as `route_set.rb:49` does.
 *
 * @internal
 */
export function controllerDispatcher(
  controllers: Map<string, DispatchableControllerClass>,
  raiseOnNameError: boolean,
): DispatcherCallback {
  return async (_controllerName: string, _action: string, _params, env: RackEnv) => {
    const req = new Request(env);
    try {
      const params = req.pathParameters;
      const controller = controllerClass(controllers, req);
      const res = controller.makeResponseBang(req);
      return await dispatch(controller, params["action"] as string, req, res);
    } catch (error) {
      if (error instanceof RoutingError) {
        if (raiseOnNameError) throw error;
        return [404, { [X_CASCADE]: "pass" }, emptyRackBody()];
      }
      throw error;
    }
  };
}

/**
 * Rails: `Request#controller_class` (`http/request.rb:88-91`) followed by
 * `Dispatcher#controller`'s `NameError` → `ActionController::RoutingError`
 * conversion (`route_set.rb:60-63`). Trails has no global constant table, so
 * `controller_class_for`'s `constantize` is a lookup in the table
 * {@link controllerDispatcher} was handed; the absent-name arm still returns
 * `PASS_NOT_FOUND` (`http/request.rb:107`).
 *
 * `PASS_NOT_FOUND` has no `make_response!`, so `Dispatcher#serve` raises
 * `NoMethodError` the moment it gets one — the arm is unreachable from
 * `serve`, which is only entered for a route that already pinned
 * `:controller`. The cast keeps that shape rather than inventing a graceful
 * 404 arm the Rails source does not have.
 *
 * @internal
 */
function controllerClass(
  controllers: Map<string, DispatchableControllerClass>,
  req: Request,
): DispatchableControllerClass {
  const params = req.pathParameters;
  if (params["action"] == null) params["action"] = "index";
  const name = params["controller"];
  if (name == null) return PassNotFound as unknown as DispatchableControllerClass;
  const controller = controllers.get(String(name));
  if (!controller) {
    throw new RoutingError(`uninitialized constant ${String(name)}`);
  }
  return controller;
}

/** Rails: `Dispatcher#dispatch` (`route_set.rb:65-67`). @internal */
async function dispatch(
  controller: DispatchableControllerClass,
  action: string,
  req: Request,
  res: Response,
): Promise<RackResponse> {
  const instance = new controller();
  await instance.dispatch(action, req, res);
  return instance.toRackResponse();
}
