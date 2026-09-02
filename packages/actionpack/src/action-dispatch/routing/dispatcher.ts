/**
 * Trails-private support for `ActionDispatch::Routing::RouteSet::Dispatcher`
 * — the structural controller-class type its `dispatch` needs. The matching
 * `Dispatcher` / `StaticDispatcher` endpoint classes live in `route-set.ts`
 * to mirror Rails' inner-class layout.
 *
 * @internal trails-private (no Rails counterpart as a standalone file)
 */

import type { RackResponse } from "@blazetrails/rack";
import type { Request } from "../http/request.js";
import type { Response } from "../http/response.js";

/**
 * The controller class shape `Dispatcher#dispatch` needs. Declared
 * structurally rather than as `ActionController::Base` so `action_dispatch`
 * keeps no import edge on `action_controller` — Rails gets the same
 * decoupling from `req.controller_class` returning whatever the constant
 * table holds.
 *
 * Rails needs only `make_response!` and the `dispatch` class method
 * (`metal.rb:331-337`).
 *
 * @internal
 */
export interface DispatchableControllerClass {
  new (): unknown;
  dispatch(action: string, req: Request, res: Response): Promise<RackResponse>;
  makeResponseBang(request: Request): Response;
}
