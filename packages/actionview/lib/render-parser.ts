import { File } from "@blazetrails/ruby-compat";

export const ALL_KNOWN_KEYS = [
  "partial",
  "template",
  "layout",
  "formats",
  "locals",
  "object",
  "collection",
  "as",
  "status",
  "contentType",
  "location",
  "spacerTemplate",
];
export const RENDER_TYPE_KEYS = ["partial", "template", "layout"];

/** @internal */
export class Base {
  protected _name: string;
  protected _code: string;

  constructor(name: string, code: string) {
    this._name = name;
    this._code = code;
  }

  /** @internal */
  protected directory(): string {
    return File.dirname(this._name);
  }

  /** @internal */
  protected partialToVirtualPath(renderType: string, partialPath: string): string {
    if (renderType === "partial" || renderType === "layout") {
      return partialPath.replace(/(\/|^)([^/]*)$/, "$1_$2");
    } else {
      return partialPath;
    }
  }
}
