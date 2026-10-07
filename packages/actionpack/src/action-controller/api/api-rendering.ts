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

function resolveContentType(options: Record<string, unknown>, fallback: string): string {
  return typeof options.contentType === "string" ? options.contentType : fallback;
}

export function renderForApi(options: Record<string, unknown>): {
  body: string;
  contentType: string;
} {
  if (options.json !== undefined) {
    const body =
      typeof options.json === "string" ? options.json : (JSON.stringify(options.json) ?? "null");
    return { body, contentType: resolveContentType(options, "application/json; charset=utf-8") };
  }
  if (options.plain !== undefined) {
    return {
      body: String(options.plain),
      contentType: resolveContentType(options, "text/plain; charset=utf-8"),
    };
  }
  if (options.body !== undefined) {
    return {
      body: String(options.body),
      contentType: resolveContentType(options, "application/octet-stream"),
    };
  }
  return { body: "", contentType: resolveContentType(options, "application/json; charset=utf-8") };
}
