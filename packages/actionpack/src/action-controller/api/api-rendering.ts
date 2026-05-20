/**
 * ActionController::ApiRendering — aggregator mirroring
 * `action_controller/api/api_rendering.rb`. Rails `includes Rendering`
 * into the host class; trails re-exports the Rendering helpers here so
 * api:compare sees the full mixed-in surface on this file.
 *
 * @see https://api.rubyonrails.org/classes/ActionController/ApiRendering.html
 */

import * as rendering from "../metal/rendering.js";

/** @internal */
export const renderToBody = rendering.renderToBody;
/** @internal */
export const render = rendering.render;
/** @internal */
export const renderToString = rendering.renderToString;
/** @internal */
export const processAction = rendering.processAction;
/** @internal */
export const _processVariant = rendering._processVariant;
/** @internal */
export const _renderInPriorities = rendering._renderInPriorities;
/** @internal */
export const _setHtmlContentType = rendering._setHtmlContentType;
/** @internal */
export const _setRenderedContentType = rendering._setRenderedContentType;
/** @internal */
export const _setVaryHeader = rendering._setVaryHeader;
/** @internal */
export const _normalizeOptions = rendering._normalizeOptions;
/** @internal */
export const _normalizeText = rendering._normalizeText;
/** @internal */
export const _processOptions = rendering._processOptions;

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
