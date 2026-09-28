import {
  _renderTemplate as actionViewRenderTemplate,
  type Base as ActionViewBase,
  type Renderer,
  type RenderToBodyHost,
} from "@blazetrails/actionview";
import type { Response } from "../../action-dispatch/http/response.js";

/** @internal */
export interface StreamingHost extends RenderToBodyHost {
  headers: Response["headers"];
  viewContext(): ActionViewBase;
  viewRenderer(): Renderer;
}

/** @internal */
export async function _renderTemplate(
  this: StreamingHost,
  options: Record<string, unknown>,
): Promise<unknown> {
  const stream = options["stream"];
  delete options["stream"];
  if (stream != null && stream !== false) {
    if (this.headers.get("cache-control") == null) this.headers.set("cache-control", "no-cache");
    return this.viewRenderer().renderBody(this.viewContext(), options as never);
  } else {
    return actionViewRenderTemplate.call(this, options);
  }
}
