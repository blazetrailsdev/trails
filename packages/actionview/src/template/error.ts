/**
 * Wraps an error raised while compiling/rendering a Template. AP's
 * ExceptionWrapper unwraps this to surface the original cause to the
 * debug view.
 */

import { getPath } from "@blazetrails/ruby-compat";
import type { Template } from "../template.js";

export interface TemplateErrorOptions {
  original: Error;
  template: Template;
}

export class TemplateError extends Error {
  /** Mirrors `SOURCE_CODE_RADIUS` (`template/error.rb:165`). */
  static readonly SOURCE_CODE_RADIUS = 3;

  /** Mirrors `attr_reader :cause` (`template/error.rb:168-171`). */
  readonly original: Error;
  /** Mirrors `attr_reader :template` (`template/error.rb:170`). */
  readonly template: Template;
  /** Mirrors `@sub_templates` (`template/error.rb:219`). */
  private subTemplates?: Template[];
  /** Mirrors `@line_number` (`template/error.rb:224`). */
  private _lineNumber?: number | null;

  constructor(opts: TemplateErrorOptions) {
    super(opts.original.message, { cause: opts.original });
    this.name = "ActionView::Template::Error";
    this.original = opts.original;
    this.template = opts.template;
  }

  /** Mirrors `Template::Error#backtrace` (`template/error.rb:181-183`). */
  backtrace(): string {
    return this.original.stack ?? "";
  }

  /** Mirrors `Template::Error#file_name` (`template/error.rb:189-191`). */
  fileName(): string {
    return this.template.identifier;
  }

  /** Mirrors `Template::Error#sub_template_message` (`template/error.rb:193-200`). */
  subTemplateMessage(): string {
    if (this.subTemplates) {
      return "Trace of template inclusion: " + this.subTemplates.map((t) => t.inspect()).join(", ");
    }
    return "";
  }

  /** Mirrors `Template::Error#source_extract` (`template/error.rb:202-215`). */
  sourceExtract(indentation = 0): string[] {
    const num = this.lineNumber();
    if (num == null) return [];

    const sourceCode = this.template.source.split("\n");

    const startOnLine = Math.max(num - TemplateError.SOURCE_CODE_RADIUS - 1, 0);
    const endOnLine = Math.min(num + TemplateError.SOURCE_CODE_RADIUS - 1, sourceCode.length);

    const indent = String(endOnLine).length + indentation;
    const slice = sourceCode.slice(startOnLine, endOnLine + 1);
    if (slice.length === 0) return [];

    return this.formattedCodeFor(slice, startOnLine, indent);
  }

  /** Mirrors `Template::Error#sub_template_of(template_path)` (`template/error.rb:217-220`). */
  subTemplateOf(templatePath: Template): void {
    this.subTemplates ??= [];
    this.subTemplates.push(templatePath);
  }

  /** Mirrors `Template::Error#line_number` (`template/error.rb:222-228`). */
  lineNumber(): number | null {
    if (this._lineNumber !== undefined) return this._lineNumber;
    this._lineNumber = null;
    const fileName = this.fileName();
    if (fileName != null && fileName !== "") {
      const regexp = new RegExp(`${escapeRegexp(getPath().basename(fileName))}:(\\d+)`);
      const fromMessage = regexp.exec(this.message);
      const match =
        fromMessage ??
        this.backtrace()
          .split("\n")
          .map((line) => regexp.exec(line))
          .find((m) => m !== null);
      if (match) this._lineNumber = Number(match[1]);
    }
    return this._lineNumber;
  }

  /** Mirrors `Template::Error#annotated_source_code` (`template/error.rb:230-232`). */
  annotatedSourceCode(): string[] {
    return this.sourceExtract(4);
  }

  /** Mirrors `Template::Error#formatted_code_for` (`template/error.rb:243-249`). */
  private formattedCodeFor(sourceCode: string[], lineCounter: number, indent: number): string[] {
    return sourceCode.map((line) => {
      lineCounter += 1;
      return `${String(lineCounter).padStart(indent)}: ${line}`;
    });
  }
}

/** `Regexp.escape` (`template/error.rb:225`). */
function escapeRegexp(source: string): string {
  return source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Mirrors `ActionView::SyntaxErrorInTemplate` (`template/error.rb:256-274`) —
 * raised by `Template#compile` when the compiled source will not parse.
 */
export class SyntaxErrorInTemplate extends TemplateError {
  private readonly offendingCodeString: string;

  constructor(template: Template, offendingCodeString: string, original: Error) {
    super({ original, template });
    this.offendingCodeString = offendingCodeString;
    this.name = "ActionView::SyntaxErrorInTemplate";
    this.message = `Encountered a syntax error while rendering template: check ${this.offendingCodeString}\n`;
  }

  /** Mirrors `SyntaxErrorInTemplate#annotated_source_code` (`template/error.rb:267-273`). */
  override annotatedSourceCode(): string[] {
    return this.offendingCodeString.split("\n").map((line, i) => {
      const indentation = " ".repeat(4);
      return `${i + 1}:${indentation}${line}`;
    });
  }
}
