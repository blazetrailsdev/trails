import { chomp } from "@blazetrails/activesupport";
import { rbEqual } from "@blazetrails/ruby-compat";
import { compileJs, type EmitJsOptions, type EmitResult } from "@blazetrails/tse-compiler";
import { ActionView } from "../../namespaces.js";
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
  type?: unknown;
  format?: string | null;
  shortIdentifier?: string | null;
}

export type TseImplementation = (source: string, options?: EmitJsOptions) => EmitResult;

export class Tse implements TemplateHandler {
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

  /** @missingRailsCall include? — PERMANENT */
  call(template: TseTemplate, source: string): string {
    const ctor = this.constructor as typeof Tse;
    const prepared = ctor.stripTrailingNewlines ? chomp(source) : source;
    const options: EmitJsOptions = {
      escapeIgnore: ctor.escapeIgnoreList.some((type) => rbEqual(type, template.type)),
    };
    if (
      ActionView.Base.annotateRenderedViewWithFilenames &&
      template.format === ":html" &&
      template.shortIdentifier
    ) {
      const id = template.shortIdentifier;
      options.preamble = `_ob.safeAppend(${JSON.stringify(`<!-- BEGIN ${id} -->`)});`;
      options.postamble = `_ob.safeAppend(${JSON.stringify(`<!-- END ${id} -->`)});`;
    }
    const result = ctor.implementation(prepared, options);
    return result.code
      .replace(
        /^\s*export\s+default\s+function\s+render\(context, locals\)\s*\{/u,
        "const context = this;",
      )
      .replace(/\}\n$/u, "");
  }
}
