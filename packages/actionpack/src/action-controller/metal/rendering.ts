/**
 * ActionController::Rendering
 *
 * Render dispatch module mixed into controllers. Mirrors the
 * Rails-private helpers used by the rendering pipeline.
 * @see https://api.rubyonrails.org/classes/ActionController/Rendering.html
 */

import { htmlEscape, isPresent } from "@blazetrails/activesupport";
import {
  DoubleRenderError,
  render as abstractRender,
  renderToString as abstractRenderToString,
  type RenderingHost as AbstractRenderHost,
} from "../../abstract-controller/rendering.js";
import { Renderer } from "../renderer.js";
import { resolveStatus } from "./status-codes.js";

export const RENDER_FORMATS_IN_PRIORITY = ["body", "plain", "html"] as const;

/**
 * Mirrors Rails `_render_in_priorities(options)` — returns the first
 * present `:body`/`:plain`/`:html` value, or `null` when none is set.
 * @internal
 */
export function _renderInPriorities(options: Record<string, unknown>): unknown {
  for (const format of RENDER_FORMATS_IN_PRIORITY) {
    if (Object.hasOwn(options, format)) return options[format];
  }
  return null;
}

/**
 * Mirrors Rails `_normalize_text(options)` — for each priority format
 * key whose value responds to `to_text`, replace it with the result.
 * @internal
 */
export function _normalizeText(options: Record<string, unknown>): void {
  for (const format of RENDER_FORMATS_IN_PRIORITY) {
    if (Object.hasOwn(options, format)) {
      const v = options[format] as { toText?: () => unknown } | null;
      if (v != null && typeof v === "object" && typeof v.toText === "function") {
        options[format] = v.toText();
      }
    }
  }
}

/**
 * Mirrors Rails `_normalize_options(options)` — normalizes text-form
 * options, HTML-escapes `:html` strings, and resolves status names to
 * numeric codes.
 * @internal
 */
export function _normalizeOptions(options: Record<string, unknown>): Record<string, unknown> {
  _normalizeText(options);
  // Ruby `if options[:key]` — only `nil`/`false` skip; `""` and `0` are
  // truthy and must still be processed.
  if (options.html != null && options.html !== false) {
    options.html = htmlEscape(options.html);
  }
  if (options.status != null && options.status !== false) {
    options.status = resolveStatus(options.status as number | string);
  }
  return options;
}

export interface RenderingHost {
  request?: {
    variant?: unknown;
    shouldApplyVaryHeader?: () => boolean;
  };
  response: {
    contentType?: string;
    getHeader(name: string): string | undefined;
    setHeader(name: string, value: string): void;
  };
  contentType: string | null;
  status: number;
  setHeader(name: string, value: string): void;
  urlFor(loc: string): string;
}

/**
 * Mirrors Rails `_process_variant(options)`. When the current request
 * declares a variant, copies it into the render options hash so the
 * downstream lookup picks the variant-specific template.
 * @internal
 */
export function _processVariant(
  this: Pick<RenderingHost, "request">,
  options: Record<string, unknown>,
): void {
  const variant = this.request?.variant;
  if (isPresent(variant)) {
    options.variant = variant;
  }
}

/**
 * Mirrors Rails `_set_html_content_type` — `self.content_type = Mime[:html].to_s`.
 * @internal
 */
export function _setHtmlContentType(this: Pick<RenderingHost, "contentType">): void {
  this.contentType = "text/html";
}

/**
 * Mirrors Rails `_set_rendered_content_type(format)` — assigns the
 * rendered format's MIME string when the response hasn't already
 * committed a media type.
 * @internal
 */
export function _setRenderedContentType(
  this: { contentType: string | null; response: { contentType?: string } },
  format: string | null | undefined,
): void {
  if (format && !this.response.contentType) {
    this.contentType = String(format);
  }
}

/**
 * Mirrors Rails `_set_vary_header` — adds `Vary: Accept` when the
 * response hasn't set one and the request indicates it should.
 * @internal
 */
export function _setVaryHeader(this: Pick<RenderingHost, "request" | "response">): void {
  const cur = this.response.getHeader("Vary") ?? this.response.getHeader("vary");
  const blank = !cur || cur.trim() === "";
  if (blank && this.request?.shouldApplyVaryHeader?.()) {
    this.response.setHeader("Vary", "Accept");
  }
}

/**
 * Mirrors Rails `_process_options(options)` — applies controller-level
 * options (`:status`, `:content_type`, `:location` in Rails) to the
 * response. Trails reads camelCase keys (`contentType`) per CLAUDE.md;
 * the snake_case Ruby symbols are documented here only for cross-
 * reference to the Rails source.
 * @internal
 */
export function _processOptions(
  this: Pick<RenderingHost, "status" | "contentType" | "setHeader" | "urlFor">,
  options: Record<string, unknown>,
): void {
  // Ruby `if options[:key]` — only `nil`/`false` skip; `""` and `0` are
  // truthy and must still be applied.
  if (options.status != null && options.status !== false) {
    this.status = resolveStatus(options.status as number | string);
  }
  if (options.contentType != null && options.contentType !== false) {
    this.contentType = String(options.contentType);
  }
  if (options.location != null && options.location !== false) {
    this.setHeader("Location", this.urlFor(String(options.location)));
  }
}

export function renderToBody(options: Record<string, unknown> = {}): string {
  const body = _renderInPriorities(options);
  return body !== null ? String(body) : " ";
}

/**
 * Mirrors Rails `ActionController::Rendering#render(*args)`. Raises
 * `DoubleRenderError` if the response body has already been set, then
 * delegates to the abstract `render`. `this`-typed so subclasses can
 * mix it in via include-style assignment.
 * @internal
 */
export function render<T extends { performed?: boolean } & AbstractRenderHost>(
  this: T,
  ...args: unknown[]
): void {
  // Rails: `if response_body` — Ruby-truthiness on the raw `@_response_body`
  // ivar. Trails' Metal `responseBody` getter stringifies to `""` even when
  // unrendered, so guarding on it would throw on the first render. Use
  // `performed` (set by Metal `markPerformed()`), which is the trails
  // equivalent of "has this action committed a response yet".
  if (this.performed) throw new DoubleRenderError();
  abstractRender.call(this, ...args);
}

/**
 * Mirrors Rails `ActionController::Rendering#render_to_string(*)`. The
 * abstract layer may produce an iterable (Rack body); collapse those
 * into a single string. Non-iterables pass through.
 * @internal
 */
export function renderToString<T extends AbstractRenderHost>(this: T, ...args: unknown[]): unknown {
  const result = abstractRenderToString.call(this, ...args);
  if (
    result != null &&
    typeof result === "object" &&
    typeof (result as { [Symbol.iterator]?: unknown })[Symbol.iterator] === "function"
  ) {
    const parts: string[] = [];
    for (const chunk of result as Iterable<unknown>) parts.push(String(chunk));
    return parts.join("");
  }
  return result;
}

/**
 * Mirrors Rails `ActionController::Rendering#process_action(*)` — sets
 * `self.formats` from `request.formats.filter_map(&:ref)` before the
 * action runs. Rails calls `super` to continue the include chain; in
 * trails the host class is responsible for chaining (this helper just
 * applies the formats side-effect). Synchronous to mirror the Ruby
 * source — host-side dispatch handles async separately.
 * @internal
 */
export function processAction<
  T extends {
    request?: { formats?: Array<{ ref?: () => unknown } | { ref?: unknown }> | undefined };
    formats?: unknown;
  },
>(this: T, ..._args: unknown[]): void {
  const reqFormats = this.request?.formats ?? [];
  const out: unknown[] = [];
  for (const f of reqFormats) {
    const ref = (f as { ref?: unknown }).ref;
    const v = typeof ref === "function" ? (ref as () => unknown).call(f) : ref;
    if (v != null) out.push(v);
  }
  this.formats = out;
}

type ControllerClass = abstract new (...args: unknown[]) => unknown;

const _renderers = new WeakMap<object, Renderer>();

export function renderer(controller: ControllerClass): Renderer {
  let r = _renderers.get(controller);
  if (!r) {
    r = Renderer.for(controller);
    _renderers.set(controller, r);
  }
  return r;
}

export function setupRendererBang(controller: ControllerClass): void {
  _renderers.set(controller, Renderer.for(controller));
}
