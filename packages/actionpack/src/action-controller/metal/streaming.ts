import type { Base as ActionViewBase, Renderer, RenderToBodyHost } from "@blazetrails/actionview";
import { Module } from "@blazetrails/activesupport";
import type { Response } from "../../action-dispatch/http/response.js";

/** @internal */
export interface StreamingHost extends RenderToBodyHost {
  headers: Response["headers"];
  viewContext(): ActionViewBase;
  viewRenderer(): Renderer;
  drainStreamingBody(body: unknown): Promise<unknown>;
}

/**
 * @internal
 * @inventedArm drainStreamingBody — CONVERGEABLE response-carries-async-streaming-body
 */
export async function _renderTemplate(
  this: StreamingHost,
  options: Record<string, unknown>,
): Promise<unknown> {
  const stream = options["stream"];
  delete options["stream"];
  if (stream != null && stream !== false) {
    if (this.headers.get("cache-control") == null) this.headers.set("cache-control", "no-cache");
    return this.drainStreamingBody(
      await this.viewRenderer().renderBody(this.viewContext(), options as never),
    );
  } else {
    return Streaming.superMethod(this, "_renderTemplate")!(options);
  }
}

export const Streaming = new Module((mod) => {
  mod.defineMethod("_renderTemplate", _renderTemplate);
});
