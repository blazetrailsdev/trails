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

import type { RackResponse } from "@blazetrails/rack";
import type { Request } from "../http/request.js";
import type { Response } from "../http/response.js";
import type { RackishResponse, RouterRequest } from "../journey/router.js";

/** @internal */
export type DispatchHandler = (
  action: string,
  req: RouterRequest,
) => RackishResponse | Promise<RackishResponse>;

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
