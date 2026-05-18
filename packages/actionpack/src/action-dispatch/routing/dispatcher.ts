/**
 * Real dispatcher used as the Journey route `app` so `Router.serve`
 * performs actual dispatch (not the throwing stub the bridge used before
 * a controller layer landed). Mirrors `ActionDispatch::Routing::RouteSet::Dispatcher`
 * in `actionpack/lib/action_dispatch/routing/route_set.rb` — one Dispatcher
 * is shared across every Journey route, and at serve-time it resolves
 * `path_parameters[:controller]` to a handler. Rails looks up the
 * controller *class*; trails has no ActionController port yet, so the
 * registry maps controller name → handler callback.
 *
 * @internal trails-private (no Rails counterpart as a standalone file)
 */

import { X_CASCADE } from "../constants.js";
import { Endpoint } from "./endpoint.js";
import type { RackishResponse, RoutableApp, RouterRequest } from "../journey/router.js";

/** @internal */
export type DispatchHandler = (action: string, req: RouterRequest) => RackishResponse;

/**
 * Mapping of controller name → handler. Lookup is by string so the same
 * registry can serve both eager (pre-registered) and lazy (registered as
 * controllers initialize) wiring.
 *
 * @internal
 */
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
 * Endpoint adapter sitting between Journey's `app.serve(req)` contract and
 * the trails dispatcher registry. Returns `X-Cascade: pass` (404) for
 * unregistered controllers so the router can keep trying alternatives —
 * same behavior Rails uses when `controller_class` raises NameError with
 * `raise_on_name_error: false`.
 *
 * @internal
 */
export class RouteDispatcher extends Endpoint implements RoutableApp {
  constructor(private readonly registry: DispatcherRegistry) {
    super();
  }

  dispatcher(): boolean {
    return true;
  }

  serve(req: RouterRequest): RackishResponse {
    const params = req.pathParameters as Record<string, unknown>;
    const controller = typeof params["controller"] === "string" ? params["controller"] : "";
    const action = typeof params["action"] === "string" ? params["action"] : "";
    const handler = this.registry.resolve(controller);
    if (!handler) {
      return [404, { [X_CASCADE]: "pass" }, []] as unknown as RackishResponse;
    }
    return handler(action, req);
  }
}
