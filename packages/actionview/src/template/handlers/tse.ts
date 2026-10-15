import { chomp, classAttribute, tokenize } from "@blazetrails/activesupport";
import { NotImplementedError, rbEqual, registerConstant } from "@blazetrails/ruby-compat";
import { compileJs, type EmitJsOptions, type EmitResult } from "@blazetrails/tse-compiler";
import { ActionView } from "../../namespaces.js";
import type { TemplateHandler } from "../handlers.js";
export class LocationParsingError extends Error {
  override name = "LocationParsingError";
}

/** @noRailsEquivalent PERMANENT */
export interface BacktraceLocation {
  lineno: number;
  column?: number;
}

export interface Spot {
  snippet: string;
  firstLineno: number;
  lastLineno: number;
  firstColumn: number;
  lastColumn: number;
  scriptLines?: string[];
}

type OffsetToken = [name: string, str: string | null, offset: number];

export function sourceLines(source: string): string[] {
  if (source.length === 0) return [];
  return source.split(/(?<=\n)/);
}

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
    try {
      const sourceLinesList = sourceLines(source);
      if (sourceLinesList.length < backtraceLocation.lineno) return null;
      const tokens = tokenize(sourceLinesList[backtraceLocation.lineno - 1]);
      const newFirstColumn = this.findOffset(spot.snippet, tokens, spot.firstColumn);
      const linenoDelta = spot.firstLineno - backtraceLocation.lineno;
      spot.firstLineno -= linenoDelta;
      spot.lastLineno -= linenoDelta;

      const columnDelta = spot.firstColumn - newFirstColumn;
      spot.firstColumn -= columnDelta;
      spot.lastColumn -= columnDelta;
      spot.scriptLines = sourceLinesList;

      return spot;
    } catch (e) {
      if (e instanceof NotImplementedError || e instanceof LocationParsingError) return null;
      throw e;
    }
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

  /** @internal */
  private findOffset(
    compiled: string,
    sourceTokens: [string, string][],
    errorColumn: number,
  ): number {
    const tokens = this.offsetSourceTokens(sourceTokens);
    let pos = 0;

    for (let i = 0; i < tokens.length - 1; i++) {
      const [name, str, offset] = tokens[i] as [string, string, number];
      const [, nextStr] = tokens[i + 1];
      let matchedStr = false;

      while (pos < compiled.length) {
        if (matchedStr && nextStr != null && compiled.startsWith(nextStr, pos)) {
          break;
        } else if (compiled.startsWith(str, pos)) {
          matchedStr = true;
          if (name === ":CODE" && pos <= errorColumn && pos + str.length >= errorColumn) {
            return errorColumn - pos + offset;
          }
          pos += str.length;
        } else {
          pos += 1;
        }
      }
    }

    throw new LocationParsingError("Couldn't find code snippet");
  }

  /** @internal */
  private offsetSourceTokens(sourceTokens: [string, string][]): OffsetToken[] {
    let sourceOffset = 0;
    const withOffset: OffsetToken[] = [];
    for (const [name, str] of sourceTokens) {
      if (name === ":CODE" || name === ":TEXT") withOffset.push([name, str, sourceOffset]);
      sourceOffset += str.length;
    }
    withOffset.push([":EOS", null, sourceOffset]);
    return withOffset;
  }
}

registerConstant("ActionView::Template::Handlers::TSE", Tse);
