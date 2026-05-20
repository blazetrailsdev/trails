/**
 * `AbstractController::Rendering` — abstract-layer hooks for the
 * render pipeline. The host class supplies a `renderToBody(options)`
 * implementation (ActionController's metal layer does this for trails);
 * the methods here are mostly normalization + empty hooks that
 * subclasses override.
 *
 * Ported from `vendor/rails/actionpack/lib/abstract_controller/rendering.rb`.
 */

import { AbstractControllerError } from "./error.js";

const DEFAULT_DOUBLE_RENDER_MESSAGE =
  "Render and/or redirect were called multiple times in this action. " +
  "Please note that you may only call render OR redirect, and at most " +
  "once per action. Also note that neither redirect nor render terminate " +
  "execution of the action, so if you want to exit an action after " +
  'redirecting, you need to do something like "redirect_to(...); return".';

export class DoubleRenderError extends AbstractControllerError {
  constructor(message?: string) {
    super(message ?? DEFAULT_DOUBLE_RENDER_MESSAGE);
    this.name = "DoubleRenderError";
  }
}

/**
 * Instance variables that should be excluded from `viewAssigns`.
 * Rails: `DEFAULT_PROTECTED_INSTANCE_VARIABLES`. Trails uses
 * underscore-prefixed names since we don't have Ruby `@` ivars; the
 * convention is to treat any leading-underscore field as private to
 * the controller.
 */
export const DEFAULT_PROTECTED_INSTANCE_VARIABLES: readonly string[] = [
  "_actionName",
  "_responseBody",
  "_formats",
  "_prefixes",
];

export interface RenderOptions {
  html?: unknown;
  [key: string]: unknown;
}

/**
 * Host shape the rendering mixins require. The metal layer's
 * `renderToBody(options)` plus `responseBody` writer satisfy this.
 */
export interface RenderingHost {
  responseBody: unknown;
  renderToBody(options: RenderOptions): unknown;
  _setHtmlContentType?(): void;
  _setRenderedContentType?(format: unknown): void;
  _setVaryHeader?(): void;
  renderedFormat?(): unknown;
}

/**
 * Normalize arguments and options, delegate to `renderToBody`, then
 * stash the result on `responseBody`. Mirrors
 * `AbstractController::Rendering#render`.
 */
export function render<T extends RenderingHost>(this: T, ...args: unknown[]): void {
  const options = normalizeRender(...args);
  const renderedBody = this.renderToBody(options);
  if (options.html != null) {
    this._setHtmlContentType?.();
  } else {
    this._setRenderedContentType?.(this.renderedFormat?.());
  }
  this._setVaryHeader?.();
  this.responseBody = renderedBody;
}

/**
 * Similar to `render`, but only returns the rendered template as a
 * string instead of setting `responseBody`. Mirrors
 * `AbstractController::Rendering#render_to_string`.
 */
export function renderToString<T extends RenderingHost>(this: T, ...args: unknown[]): unknown {
  const options = normalizeRender(...args);
  return this.renderToBody(options);
}

/**
 * Collect non-protected instance fields as a `{ name: value }` map for
 * view rendering. Excludes anything in
 * `DEFAULT_PROTECTED_INSTANCE_VARIABLES` and anything starting with
 * `_` (the trails convention for "private").
 */
export function viewAssigns<T extends object>(this: T): Record<string, unknown> {
  const out: Record<string, unknown> = Object.create(null);
  const protectedSet = new Set(DEFAULT_PROTECTED_INSTANCE_VARIABLES);
  for (const name of Object.keys(this)) {
    if (name.startsWith("_") || protectedSet.has(name)) continue;
    out[name] = (this as Record<string, unknown>)[name];
  }
  return out;
}

// ===========================================================================
// Internal helpers — exported for subclass override + tests.
// ===========================================================================

/**
 * Abstract-layer arg normalizer. Handles only the cases Rails'
 * `AbstractController::Rendering#_normalize_args` handles:
 * - a permitted strong-params-like object (uses it directly, or raises
 *   if not permitted)
 * - a plain options hash (returns it)
 * - anything else (returns the second `options` arg as-is)
 *
 * String → `{ action: ... }` shorthand lives in
 * `ActionController::Rendering#_normalize_args` (the concrete layer)
 * and should be added there, not here.
 */
export function _normalizeArgs(action?: unknown, options: RenderOptions = {}): RenderOptions {
  // Strong-params-style permitted hash: trails uses a duck-typed
  // `permitted?(): boolean` predicate when applicable.
  if (action != null && typeof (action as { permitted?: () => boolean }).permitted === "function") {
    if ((action as { permitted: () => boolean }).permitted()) {
      return action as RenderOptions;
    }
    throw new Error("render parameters are not permitted");
  }
  if (action != null && typeof action === "object" && !Array.isArray(action)) {
    return action as RenderOptions;
  }
  return options;
}

/** Hook — subclasses override to post-process the options hash. */
export function _normalizeOptions(options: RenderOptions): RenderOptions {
  return options;
}

/** Hook — subclasses override to process individual option keys. */
export function _processOptions(options: RenderOptions): RenderOptions {
  return options;
}

/** Combined normalization: args → options → variant → final hash. */
export function normalizeRender(...args: unknown[]): RenderOptions {
  const options = _normalizeArgs(...(args as [unknown?, RenderOptions?]));
  _processVariant(options);
  return _normalizeOptions(options);
}

/** Hook — subclasses override to handle `:variant` option. */
export function _processVariant(_options: RenderOptions): void {
  // Empty in the abstract layer.
}

/**
 * Hook — subclasses override to process the rendered format. Empty
 * at the abstract layer (mirrors Rails' `_process_format` in
 * `AbstractController::Rendering`).
 *
 * @internal
 */
export function _processFormat(_format: unknown): void {
  // Empty in the abstract layer.
}

/**
 * Rails-shaped private `_normalize_render(*args)` entry point. Same
 * signature/behavior as `normalizeRender` (the trails-named public
 * helper); kept here so the Rails-private name is exported for
 * `api:compare` and for subclasses that override the private hook.
 *
 * @internal
 */
export function _normalizeRender(...args: unknown[]): RenderOptions {
  return normalizeRender(...args);
}

/**
 * The instance-field names excluded from `viewAssigns`. Mirrors Rails'
 * private `_protected_ivars` (which simply returns the
 * `DEFAULT_PROTECTED_INSTANCE_VARIABLES` constant). Exported as a
 * function so subclasses can override and so `api:compare` matches.
 *
 * @internal
 */
export function _protectedIvars(): readonly string[] {
  return DEFAULT_PROTECTED_INSTANCE_VARIABLES;
}
