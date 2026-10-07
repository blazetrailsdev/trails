import {
  Concern,
  Module,
  ToJsonWithActiveSupportEncoder,
  classAttribute,
  extend,
  isPresent,
  type ToJsonWithActiveSupportEncoderHost,
} from "@blazetrails/activesupport";
import { rbFSend, rbObjRespondTo } from "@blazetrails/ruby-compat";
import { Mime } from "../../action-dispatch/http/mime-type.js";

export class MissingRenderer extends Error {
  constructor(format: string) {
    super(`No renderer defined for format: ${format}`);
    this.name = "MissingRenderer";
  }
}

export type RendererProc = (
  this: RenderersHost,
  value: unknown,
  options: Record<string, unknown>,
) => unknown;

export interface RenderersHost {
  contentType: string | null;
  readonly mediaType: string | undefined;
  readonly _renderers: ReadonlySet<string>;
  _processOptions(options: Record<string, unknown>): unknown;
  _renderToBodyWithRenderer(options: Record<string, unknown>): unknown;
}

export const RENDERERS = new Set<string>();

export function add(key: string, block: RendererProc): void {
  Renderers.defineMethod(_renderWithRendererMethodName(key), block);
  RENDERERS.add(key);
}

export function remove(key: string): void {
  RENDERERS.delete(key);
  const methodName = _renderWithRendererMethodName(key);
  if (Renderers.isMethodDefined(methodName)) Renderers.undefMethod(methodName);
}

export function _renderWithRendererMethodName(key: string): string {
  return `_render_with_renderer_${key}`;
}

export function useRenderers(this: { _renderers: ReadonlySet<string> }, ...args: string[]): void {
  const renderers = new Set([...this._renderers, ...args]);
  this._renderers = Object.freeze(renderers);
}

export const ClassMethods = { useRenderers, useRenderer: useRenderers };

export function renderToBody(this: RenderersHost, options: Record<string, unknown>): unknown {
  const body = this._renderToBodyWithRenderer(options);
  return body != null && body !== false
    ? body
    : Renderers.superMethod(this, "renderToBody")!(options);
}

export function _renderToBodyWithRenderer(
  this: RenderersHost,
  options: Record<string, unknown>,
): unknown {
  for (const name of this._renderers) {
    if (Object.hasOwn(options, name)) {
      this._processOptions(options);
      const methodName = Renderers._renderWithRendererMethodName(name);
      const value = options[name];
      delete options[name];
      return rbFSend(this, methodName, value, options);
    }
  }
  return null;
}

type IncludedBlock = { included(base: null, block: (this: any) => void): void };

export const Renderers = new Module((mod) => {
  extend(mod, Concern);

  (mod as unknown as IncludedBlock).included(null, function () {
    classAttribute.call(this, "_renderers", { default: Object.freeze(new Set<string>()) });
  });

  mod.defineMethod("renderToBody", renderToBody);
  mod.defineMethod("_renderToBodyWithRenderer", _renderToBodyWithRenderer);
}) as Module & {
  RENDERERS: Set<string>;
  All: Module;
  ClassMethods: typeof ClassMethods;
  add: typeof add;
  remove: typeof remove;
  _renderWithRendererMethodName: typeof _renderWithRendererMethodName;
};
Renderers.RENDERERS = RENDERERS;
Renderers.ClassMethods = ClassMethods;
Renderers.add = add;
Renderers.remove = remove;
Renderers._renderWithRendererMethodName = _renderWithRendererMethodName;

export const All = new Module((mod) => {
  extend(mod, Concern);
  mod.include(Renderers);

  (mod as unknown as IncludedBlock).included(null, function () {
    this._renderers = RENDERERS;
  });
});
Renderers.All = All;

Renderers.add("json", function (json, options) {
  const {
    callback: _callback,
    contentType: _contentType,
    status: _status,
    ...jsonOptions
  } = options;
  if (typeof json !== "string") {
    json = rbObjRespondTo(json, "toJSON")
      ? (json as { toJSON(options: Record<string, unknown>): unknown }).toJSON(jsonOptions)
      : ToJsonWithActiveSupportEncoder.toJSON.call(
          json as ToJsonWithActiveSupportEncoderHost,
          jsonOptions,
        );
  }

  if (isPresent(options.callback)) {
    if (this.mediaType == null || Mime.get("json")!.equals(this.mediaType)) {
      this.contentType = Mime.get("js")!.toString();
    }

    return `/**/${String(options.callback)}(${String(json)})`;
  } else {
    if (this.mediaType == null) this.contentType = Mime.get("json")!.toString();
    return json;
  }
});

Renderers.add("js", function (js, options) {
  if (this.mediaType == null) this.contentType = Mime.get("js")!.toString();
  return rbObjRespondTo(js, "toJs")
    ? (js as { toJs(options: Record<string, unknown>): unknown }).toJs(options)
    : js;
});

Renderers.add("xml", function (xml, options) {
  if (this.mediaType == null) this.contentType = Mime.get("xml")!.toString();
  return rbObjRespondTo(xml, "toXml")
    ? (xml as { toXml(options: Record<string, unknown>): unknown }).toXml(options)
    : xml;
});
