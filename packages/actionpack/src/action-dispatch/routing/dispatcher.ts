/**
 * Trails-private support for `ActionDispatch::Routing::RouteSet::Dispatcher`
 * — a RouteSet-scoped overlay on the controller constant table
 * `Request#controllerClassFor` resolves against. Ruby has one global constant
 * namespace, so Rails needs no such overlay; trails keeps one per RouteSet so
 * a route set can bind a controller without publishing it process-wide. The
 * matching `Dispatcher` / `StaticDispatcher` endpoint classes live in
 * `route-set.ts` to mirror Rails' inner-class layout.
 *
 * @internal trails-private (no Rails counterpart as a standalone file)
 */

import type { RackResponse } from "@blazetrails/rack";
import type { Request } from "../http/request.js";
import type { Response } from "../http/response.js";

/** @internal */
export class DispatcherRegistry {
  private readonly controllers = new Map<string, DispatchableControllerClass>();

  register(controller: string, controllerClass: DispatchableControllerClass): void {
    this.controllers.set(controller, controllerClass);
  }

  unregister(controller: string): void {
    this.controllers.delete(controller);
  }

  has(controller: string): boolean {
    return this.controllers.has(controller);
  }

  /** @internal */
  resolve(controller: string): DispatchableControllerClass | undefined {
    return this.controllers.get(controller);
  }

  clear(): void {
    this.controllers.clear();
  }
}

/**
 * The controller class shape `Dispatcher#dispatch` needs. Declared
 * structurally rather than as `ActionController::Base` so `action_dispatch`
 * keeps no import edge on `action_controller` — Rails gets the same
 * decoupling from `req.controller_class` returning whatever the constant
 * table holds.
 *
 * Rails needs only `make_response!` and the `dispatch` class method
 * (`metal.rb:331-337`); the instance `dispatch` + `to_a` pair stands in until
 * story `port-metal-dispatch-class-method` lands the class method.
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
