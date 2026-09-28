import {
  ToJsonWithActiveSupportEncoder,
  isPresent,
  type ToJsonWithActiveSupportEncoderHost,
} from "@blazetrails/activesupport";
import { rbObjRespondTo } from "@blazetrails/ruby-compat";
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
  _processOptions(options: Record<string, unknown>): void;
}

const RENDERERS = new Set<string>();

export class Renderers {
  /** @internal */
  static _registry = new Map<string, RendererProc>();

  static get RENDERERS(): ReadonlySet<string> {
    return new Set(RENDERERS);
  }

  static _renderWithRendererMethodName(key: string): string {
    return `_render_with_renderer_${key}`;
  }

  static add(key: string, block: RendererProc): void {
    RENDERERS.add(key);
    this._registry.set(this._renderWithRendererMethodName(key), block);
  }

  static remove(key: string): void {
    RENDERERS.delete(key);
    this._registry.delete(this._renderWithRendererMethodName(key));
  }

  static get(key: string): RendererProc | undefined {
    return this._registry.get(this._renderWithRendererMethodName(key));
  }

  static useRenderers(...args: string[]): void {
    for (const name of args) {
      RENDERERS.add(name);
    }
  }
}

export function _renderToBodyWithRenderer(
  this: RenderersHost,
  options: Record<string, unknown>,
): unknown {
  for (const name of RENDERERS) {
    if (Object.hasOwn(options, name)) {
      this._processOptions(options);
      const methodName = Renderers._renderWithRendererMethodName(name);
      const value = options[name];
      delete options[name];
      return Renderers._registry.get(methodName)!.call(this, value, options);
    }
  }
  return null;
}

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
