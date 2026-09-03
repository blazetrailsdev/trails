/** @internal */

import type { RackResponse } from "@blazetrails/rack";
import type { Request } from "../http/request.js";
import type { Response } from "../http/response.js";

/** @internal */
export interface DispatchableControllerClass {
  new (): unknown;
  dispatch(action: string, req: Request, res: Response): Promise<RackResponse>;
  makeResponseBang(request: Request): Response;
}
