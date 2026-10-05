import { htmlEscape, isPresent, Module } from "@blazetrails/activesupport";
import {
  DoubleRenderError,
  render as abstractRender,
  renderToString as abstractRenderToString,
  type RenderingHost as AbstractRenderHost,
} from "../../abstract-controller/rendering.js";
import { Renderer } from "../renderer.js";
import { statusCode } from "@blazetrails/rack";

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
    options.status = statusCode(options.status as number | string);
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
  headers: { set(name: string, value: string): unknown };
  urlFor(options: unknown): string;
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
  this: { contentType: string | null; response: { mediaType?: string | null } },
  format: { toString(): string } | null | undefined,
): void {
  if (format && !this.response.mediaType) {
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
  this: Pick<RenderingHost, "contentType" | "headers" | "urlFor"> & { status: number | string },
  options: Record<string, unknown>,
): void {
  if (options.status != null && options.status !== false) {
    this.status = options.status as number | string;
  }
  if (options.contentType != null && options.contentType !== false) {
    this.contentType = String(options.contentType);
  }
  if (options.location != null && options.location !== false) {
    this.headers.set("Location", this.urlFor(options.location));
  }
}

export function renderToBody(options: Record<string, unknown> = {}): unknown {
  const body = _renderInPriorities(options);
  return body != null && body !== false ? body : " ";
}

/** @internal */
export function render<T extends { performed?: boolean } & AbstractRenderHost>(
  this: T,
  ...args: unknown[]
): void | Promise<void> {
  if (this.performed) throw new DoubleRenderError();
  return abstractRender.call(this, ...args);
}

/** @internal */
export function renderToString<T extends AbstractRenderHost>(this: T, ...args: unknown[]): unknown {
  const result = abstractRenderToString.call(this, ...args);
  const toString = (result: unknown): unknown => {
    if (
      result != null &&
      typeof result === "object" &&
      typeof (result as { [Symbol.iterator]?: unknown })[Symbol.iterator] === "function"
    ) {
      let string = "";
      for (const r of result as Iterable<unknown>) string += String(r);
      return string;
    }
    return result;
  };
  if (typeof (result as PromiseLike<unknown> | null)?.then === "function") {
    return Promise.resolve(result).then(toString);
  }
  return toString(result);
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

export const Rendering: Module = new Module((mod) => {
  mod.defineMethod("render", function (this: AbstractRenderHost, ...args: unknown[]) {
    if (this.responseBody != null) throw new DoubleRenderError();
    return mod.superMethod(this, "render")!(...args);
  });

  mod.defineMethod("renderToString", function (this: AbstractRenderHost, ...args: unknown[]) {
    const result = mod.superMethod(this, "renderToString")!(...args);
    const toString = (result: unknown): unknown => {
      if (
        typeof (result as { [Symbol.iterator]?: unknown } | null)?.[Symbol.iterator] ===
          "function" &&
        typeof result !== "string"
      ) {
        let string = "";
        for (const r of result as Iterable<unknown>) string += r;
        return string;
      } else {
        return result;
      }
    };
    return typeof (result as PromiseLike<unknown> | null)?.then === "function"
      ? Promise.resolve(result).then(toString)
      : toString(result);
  });

  mod.defineMethod(
    "renderToBody",
    function (this: AbstractRenderHost, options: Record<string, unknown> = {}) {
      const orPriorities = (body: unknown): unknown => {
        if (body != null && body !== false) return body;
        const priority = _renderInPriorities(options);
        return priority != null && priority !== false ? priority : " ";
      };
      const body = mod.superMethod(this, "renderToBody")?.(options);
      return typeof (body as PromiseLike<unknown> | null)?.then === "function"
        ? Promise.resolve(body).then(orPriorities)
        : orPriorities(body);
    },
  );

  mod.defineMethod("processAction", function (this: object, ...args: unknown[]) {
    processAction.call(this as never);
    return mod.superMethod(this, "processAction")!(...args);
  });

  mod.defineMethod("_processVariant", _processVariant);
  mod.defineMethod("_renderInPriorities", _renderInPriorities);
  mod.defineMethod("_setHtmlContentType", _setHtmlContentType);
  mod.defineMethod("_setRenderedContentType", _setRenderedContentType);
  mod.defineMethod("_setVaryHeader", _setVaryHeader);

  mod.defineMethod("_normalizeOptions", function (this: object, options: Record<string, unknown>) {
    _normalizeOptions(options);
    return mod.superMethod(this, "_normalizeOptions")!(options);
  });

  mod.defineMethod("_normalizeText", _normalizeText);

  mod.defineMethod("_processOptions", function (this: object, options: Record<string, unknown>) {
    _processOptions.call(this as never, options);
    return mod.superMethod(this, "_processOptions")!(options);
  });
});
