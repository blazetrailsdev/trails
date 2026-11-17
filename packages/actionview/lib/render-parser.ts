import { File } from "@blazetrails/ruby-compat";
import { dasherize } from "@blazetrails/activesupport";

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

  /**
   * @inventedArm dasherize — PERMANENT
   * @internal
   */
  protected partialToVirtualPath(renderType: string, partialPath: string): string {
    if (renderType === "partial" || renderType === "layout") {
      const directoryEnd = partialPath.lastIndexOf("/");
      if (directoryEnd >= 0)
        partialPath =
          dasherize(partialPath.slice(0, directoryEnd)) + partialPath.slice(directoryEnd);
      return partialPath.replace(/(\/|^)([^/]*)$/, "$1_$2");
    } else {
      return partialPath;
    }
  }
}
