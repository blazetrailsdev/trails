import { chomp, classAttribute } from "@blazetrails/activesupport";
import { rbEqual, registerConstant } from "@blazetrails/ruby-compat";
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
  _streaming?: boolean;
}

export type TseImplementation = (source: string, options?: EmitJsOptions) => EmitResult;

export class Tse implements TemplateHandler {
  declare static tseTrimMode: string;
  declare static isTseTrimMode: boolean;
  declare static tseImplementation: TseImplementation;
  declare static isTseImplementation: boolean;
  declare static escapeIgnoreList: string[];
  declare static isEscapeIgnoreList: boolean;
  declare static stripTrailingNewlines: boolean;
  declare static isStripTrailingNewlines: boolean;
  declare stripTrailingNewlines: boolean;

  static {
    classAttribute.call(this, "tseTrimMode", { default: "-" });
    classAttribute.call(this, "tseImplementation", { default: compileJs });
    classAttribute.call(this, "escapeIgnoreList", { default: ["text/plain"] });
    classAttribute.call(this, "stripTrailingNewlines", { default: false });
  }

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
    const prepared = this.stripTrailingNewlines ? chomp(source) : source;
    const options: EmitJsOptions = {
      escapeIgnore: ctor.escapeIgnoreList.some((type) => rbEqual(type, template.type)),
      trim: ctor.tseTrimMode === "-",
      async: template._streaming === true,
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
    const result = ctor.tseImplementation(prepared, options);
    return result.code
      .replace(
        /^\s*export\s+default\s+(?:async\s+)?function\s+render\(context, locals\)\s*\{/u,
        "const context = this;",
      )
      .replace(/\}\n$/u, "");
  }
}

registerConstant("ActionView::Template::Handlers::TSE", Tse);
