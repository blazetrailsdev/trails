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

export interface RenderingHost {
  responseBody: unknown;
  renderToBody(options: RenderOptions): unknown;
  /** @internal */
  _setHtmlContentType?(): void;
  /** @internal */
  _setRenderedContentType?(format: unknown): void;
  /** @internal */
  _setVaryHeader?(): void;
  renderedFormat?(): unknown;
}

export function render<T extends RenderingHost>(this: T, ...args: unknown[]): void {
  const options = _normalizeRender(...args);
  const renderedBody = this.renderToBody(options);
  if (options.html != null) {
    this._setHtmlContentType?.();
  } else {
    this._setRenderedContentType?.(this.renderedFormat?.());
  }
  this._setVaryHeader?.();
  this.responseBody = renderedBody;
}

export function renderToString<T extends RenderingHost>(this: T, ...args: unknown[]): unknown {
  const options = _normalizeRender(...args);
  return this.renderToBody(options);
}

export function viewAssigns<T extends object>(this: T): Record<string, unknown> {
  const out: Record<string, unknown> = Object.create(null);
  const protectedSet = new Set(DEFAULT_PROTECTED_INSTANCE_VARIABLES);
  for (const name of Object.keys(this)) {
    if (name.startsWith("_") || protectedSet.has(name)) continue;
    out[name] = (this as Record<string, unknown>)[name];
  }
  return out;
}

export function _normalizeArgs(action?: unknown, options: RenderOptions = {}): RenderOptions {
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

export function _normalizeOptions(options: RenderOptions): RenderOptions {
  return options;
}

export function _processOptions(options: RenderOptions): RenderOptions {
  return options;
}

/** @internal */
export function _normalizeRender(...args: unknown[]): RenderOptions {
  const options = _normalizeArgs(...(args as [unknown?, RenderOptions?]));
  _processVariant(options);
  return _normalizeOptions(options);
}

/** @internal */
export function _processVariant(_options: RenderOptions): void {}

/** @internal */
export function _processFormat(_format: unknown): void {}

/** @internal */
export function _protectedIvars(): readonly string[] {
  return DEFAULT_PROTECTED_INSTANCE_VARIABLES;
}
