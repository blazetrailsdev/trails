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

/** @internal */
export function _renderInPriorities(options: Record<string, unknown>): unknown {
  for (const format of RENDER_FORMATS_IN_PRIORITY) {
    if (Object.hasOwn(options, format)) return options[format];
  }
  return null;
}

/** @internal */
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

/** @internal */
export function _normalizeOptions(options: Record<string, unknown>): Record<string, unknown> {
  _normalizeText(options);
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

/** @internal */
export function _processVariant(
  this: Pick<RenderingHost, "request">,
  options: Record<string, unknown>,
): void {
  const variant = this.request?.variant;
  if (isPresent(variant)) {
    options.variant = variant;
  }
}

/** @internal */
export function _setHtmlContentType(this: Pick<RenderingHost, "contentType">): void {
  this.contentType = "text/html";
}

/** @internal */
export function _setRenderedContentType(
  this: { contentType: string | null; response: { contentType?: string } },
  format: string | null | undefined,
): void {
  if (format && !this.response.contentType) {
    this.contentType = String(format);
  }
}

/** @internal */
export function _setVaryHeader(this: Pick<RenderingHost, "request" | "response">): void {
  const cur = this.response.getHeader("Vary") ?? this.response.getHeader("vary");
  const blank = !cur || cur.trim() === "";
  if (blank && this.request?.shouldApplyVaryHeader?.()) {
    this.response.setHeader("Vary", "Accept");
  }
}

/** @internal */
export function _processOptions(
  this: Pick<RenderingHost, "status" | "contentType" | "setHeader" | "urlFor">,
  options: Record<string, unknown>,
): void {
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

/** @internal */
export function render<T extends { performed?: boolean } & AbstractRenderHost>(
  this: T,
  ...args: unknown[]
): void {
  if (this.performed) throw new DoubleRenderError();
  abstractRender.call(this, ...args);
}

/** @internal */
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

/** @internal */
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
