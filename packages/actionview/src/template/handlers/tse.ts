import { chomp, classAttribute } from "@blazetrails/activesupport";
import { rbEqual } from "@blazetrails/ruby-compat";
import {
  compileJs,
  hyphenPragma,
  type EmitJsOptions,
  type EmitResult,
  type HyphenOptions,
} from "@blazetrails/tse-compiler";
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
  _streaming?: boolean;
}

export type TseImplementation = (source: string, options?: EmitJsOptions) => EmitResult;

export class Tse implements TemplateHandler {
  static trimMode: string = "-";

  declare static escapeIgnoreList: string[];
  declare static isEscapeIgnoreList: boolean;

  static {
    classAttribute.call(this, "escapeIgnoreList", { default: ["text/plain"] });
  }

  static stripTrailingNewlines: boolean = false;

  static implementation: TseImplementation = compileJs;

  /** @noRailsEquivalent PERMANENT */
  static hyphenNames: HyphenOptions | null = null;

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
    const ctor = this.constructor as typeof Tse;
    const pragma = hyphenPragma(source);
    const hyphenNames = pragma === undefined ? ctor.hyphenNames : pragma;
    return translateLocationImpl(spot, backtraceLocation, source, hyphenNames);
  }

  /** @missingRailsCall include? — PERMANENT */
  call(template: TseTemplate, source: string): string {
    const ctor = this.constructor as typeof Tse;
    const prepared = ctor.stripTrailingNewlines ? chomp(source) : source;
    const options: EmitJsOptions = {
      escapeIgnore: ctor.escapeIgnoreList.some((type) => rbEqual(type, template.type)),
      trim: ctor.trimMode === "-",
      async: template._streaming === true,
    };
    if (ctor.hyphenNames !== null) options.hyphenNames = ctor.hyphenNames;
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
        /^\s*export\s+default\s+(?:async\s+)?function\s+render\(context, locals\)\s*\{/u,
        "const context = this;",
      )
      .replace(/\}\n$/u, "");
  }
}
