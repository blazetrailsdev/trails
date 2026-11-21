import { ActionController } from "../../namespaces.js";
import { rbCallSuper } from "@blazetrails/ruby-compat";
import type { Base as ActionViewBase, Renderer, RenderToBodyHost } from "@blazetrails/actionview";
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
    return this.viewRenderer().renderBody(this.viewContext(), options);
  } else {
    return rbCallSuper(this, _renderTemplate, options);
  }
}

export const Streaming = { _renderTemplate };

ActionController.Streaming = Streaming;
