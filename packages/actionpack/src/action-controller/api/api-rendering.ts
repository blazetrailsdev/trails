import { Concern, extend, include, Module } from "@blazetrails/activesupport";
import { Rendering } from "../metal/rendering.js";

export function renderToBody(
  this: { _processOptions(options: Record<string, unknown>): unknown },
  options: Record<string, unknown> = {},
): unknown {
  this._processOptions(options);
  return ApiRendering.superMethod(this, "renderToBody")!(options);
}

export const ApiRendering = new Module((mod) => {
  extend(mod, Concern);

  (mod as unknown as { included(base: null, block: (this: object) => void): void }).included(
    null,
    function (this: object) {
      include(this, Rendering);
    },
  );

  mod.defineMethod("renderToBody", renderToBody);
});
