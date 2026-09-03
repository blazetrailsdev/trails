import { chomp } from "@blazetrails/activesupport";
import { compileJs, type EmitJsOptions, type EmitResult } from "@blazetrails/tse-compiler";
import { _Base } from "../../base-slot.js";
import type { TemplateHandler } from "../handlers.js";
import {
  translateLocation as translateLocationImpl,
  type BacktraceLocation,
  type Spot,
} from "./tse-translate-location.js";

export {
  LocationParsingError,
  type BacktraceLocation,
  type Spot,
} from "./tse-translate-location.js";

export interface TseTemplate {
  type?: string | null;
  format?: string | null;
  shortIdentifier?: string | null;
}

export type TseImplementation = (source: string, options?: EmitJsOptions) => EmitResult;

export class Tse implements TemplateHandler {
  readonly extensions = ["tse"];

  static trimMode: string = "-";

  static escapeIgnoreList: string[] = ["text/plain"];

  static stripTrailingNewlines: boolean = false;

  static implementation: TseImplementation = compileJs;

  static call(template: TseTemplate, source: string): string {
    return new this().call(template, source);
  }

  supportsStreaming(): boolean {
    return true;
  }

  handlesEncoding(): boolean {
    return true;
  }

  translateLocation(spot: Spot, backtraceLocation: BacktraceLocation, source: string): Spot | null {
    return translateLocationImpl(spot, backtraceLocation, source);
  }

  call(template: TseTemplate, source: string): string {
    const ctor = this.constructor as typeof Tse;
    const prepared = ctor.stripTrailingNewlines ? chomp(source) : source;
    const mime = template.type != null ? formatToMimeType(template.type) : null;
    const escapeIgnore = mime != null && ctor.escapeIgnoreList.includes(mime);
    const options: EmitJsOptions = { escapeIgnore };
    const format = template.format ?? (mime === "text/html" ? "html" : null);
    if (_Base!.annotateRenderedViewWithFilenames && format === "html" && template.shortIdentifier) {
      const id = template.shortIdentifier;
      options.preamble = `_ob.safeAppend(${JSON.stringify(`<!-- BEGIN ${id} -->`)});`;
      options.postamble = `_ob.safeAppend(${JSON.stringify(`<!-- END ${id} -->`)});`;
    }
    const result = ctor.implementation(prepared, options);
    return (
      "(" +
      result.code
        .replace(/^import\s+\{[^}]*\}\s+from\s+"[^"]*";\n?/u, "")
        .replace(/^\s*export\s+default\s+/u, "")
        .replace(/^function\s+render\b/u, "function __tseCompiled") +
      ")(this, localAssigns)"
    );
  }
}
/** @internal */
function formatToMimeType(format: string): string {
  switch (format) {
    case "html":
      return "text/html";
    case "text":
      return "text/plain";
    case "json":
      return "application/json";
    case "xml":
      return "application/xml";
    case "js":
      return "text/javascript";
    case "css":
      return "text/css";
    default:
      return format;
  }
}
