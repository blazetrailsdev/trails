import { ActionController } from "../../namespaces.js";
import { rbModConstSet } from "@blazetrails/ruby-compat";
import {
  Concern,
  extend,
  htmlEscape,
  isBlank,
  isPresent,
  Module,
} from "@blazetrails/activesupport";
import { rbFSend, rbObjRespondTo } from "@blazetrails/ruby-compat";
import { Mime } from "../../action-dispatch/http/mime-type.js";
import {
  DoubleRenderError,
  type RenderingHost as AbstractRenderHost,
} from "../../abstract-controller/rendering.js";
import { Renderer, type RendererController } from "../renderer.js";
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
export function _normalizeOptions(
  this: object,
  options: Record<string, unknown>,
): Record<string, unknown> {
  _normalizeText(options);
  if (options.html != null && options.html !== false) {
    options.html = htmlEscape(options.html);
  }
  if (options.status != null && options.status !== false) {
    options.status = statusCode(options.status as number | string);
  }
  return Rendering.superMethod(this, "_normalizeOptions")!(options) as Record<string, unknown>;
}

export interface RenderingHost {
  request: {
    variant?: unknown;
    shouldApplyVaryHeader(): boolean;
  } | null;
  response: {
    contentType?: string;
    headers: { get(key: string): string | undefined; set(key: string, value: string): unknown };
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
  if (rbObjRespondTo(this, "request") && this.request != null && isPresent(this.request.variant)) {
    options.variant = this.request.variant;
  }
}

/** @internal */
export function _setHtmlContentType(this: Pick<RenderingHost, "contentType">): void {
  this.contentType = Mime.get("html")!.toString();
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
  if (isBlank(this.response.headers.get("Vary")) && this.request!.shouldApplyVaryHeader()) {
    this.response.headers.set("Vary", "Accept");
  }
}

/** @internal */
export function _processOptions(
  this: Pick<RenderingHost, "contentType" | "headers" | "urlFor"> & { status: number | string },
  options: Record<string, unknown>,
): unknown {
  if (options.status != null && options.status !== false) {
    this.status = options.status as number | string;
  }
  if (options.contentType != null && options.contentType !== false) {
    this.contentType = String(options.contentType);
  }
  if (options.location != null && options.location !== false) {
    this.headers.set("Location", this.urlFor(options.location));
  }
  return Rendering.superMethod(this, "_processOptions")!(options);
}

export function render(this: AbstractRenderHost, ...args: unknown[]): unknown {
  if (this.responseBody != null) throw new DoubleRenderError();
  return Rendering.superMethod(this, "render")!(...args);
}

/**
 * @inventedArm if — PERMANENT
 * @inventedArm then — PERMANENT
 */
export function renderToString(this: AbstractRenderHost, ...args: unknown[]): unknown {
  const result = Rendering.superMethod(this, "renderToString")!(...args);
  const toString = (result: unknown): unknown => {
    if (rbObjRespondTo(result, "each")) {
      let string = "";
      const each = rbFSend(result, "each", (r: unknown) => (string += r));
      return typeof (each as PromiseLike<unknown> | null)?.then === "function"
        ? Promise.resolve(each).then(() => string)
        : string;
    } else {
      return result;
    }
  };
  return typeof (result as PromiseLike<unknown> | null)?.then === "function"
    ? Promise.resolve(result).then(toString)
    : toString(result);
}

/** @internal */
export function renderToBody(this: object, options: Record<string, unknown> = {}): unknown {
  const orPriorities = (body: unknown): unknown => {
    if (body != null && body !== false) return body;
    const priority = _renderInPriorities(options);
    return priority != null && priority !== false ? priority : " ";
  };
  const body = Rendering.superMethod(this, "renderToBody")!(options);
  return typeof (body as PromiseLike<unknown> | null)?.then === "function"
    ? Promise.resolve(body).then(orPriorities)
    : orPriorities(body);
}

/** @internal */
export function processAction(
  this: {
    request: { formats: Array<{ ref(): unknown }> };
    formats?: unknown;
  },
  ...args: unknown[]
): unknown {
  this.formats = this.request.formats.map((f) => f.ref()).filter((ref) => ref != null);
  return Rendering.superMethod(this, "processAction")!(...args);
}

export interface RenderingClassHost extends RendererController {
  _renderer?: Renderer;
  readonly renderer: Renderer;
  setupRendererBang(): void;
}

export function renderer(this: RenderingClassHost): Renderer {
  if (!Object.hasOwn(this, "_renderer")) this.setupRendererBang();
  return this._renderer!;
}

/** @internal */
export function setupRendererBang(this: RenderingClassHost): void {
  this._renderer = Renderer.for(this);
}

export const ClassMethods: Module = new Module((mod) => {
  mod.defineMethod("render", function (this: RenderingClassHost, ...args: unknown[]) {
    return this.renderer.render(...args);
  });

  mod.moduleEval((m) => {
    Object.defineProperty(m, "renderer", { configurable: true, get: renderer });
  });

  mod.defineMethod("setupRendererBang", setupRendererBang);
});

export const Rendering = new Module((mod) => {
  extend(mod, Concern);

  mod.defineMethod("render", render);
  mod.defineMethod("renderToString", renderToString);
  mod.defineMethod("renderToBody", renderToBody);
  mod.defineMethod("processAction", processAction);
  mod.defineMethod("_processVariant", _processVariant);
  mod.defineMethod("_renderInPriorities", _renderInPriorities);
  mod.defineMethod("_setHtmlContentType", _setHtmlContentType);
  mod.defineMethod("_setRenderedContentType", _setRenderedContentType);
  mod.defineMethod("_setVaryHeader", _setVaryHeader);
  mod.defineMethod("_normalizeOptions", _normalizeOptions);
  mod.defineMethod("_normalizeText", _normalizeText);
  mod.defineMethod("_processOptions", _processOptions);
}) as Module & { ClassMethods: Module };
Rendering.ClassMethods = ClassMethods;

rbModConstSet(ActionController, "Rendering", Rendering);
