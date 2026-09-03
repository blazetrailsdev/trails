import { File, regexpEscape } from "@blazetrails/ruby-compat";
import type { Template } from "../template.js";

export interface TemplateErrorOptions {
  original: Error;
  template: Template;
}

export class TemplateError extends Error {
  static readonly SOURCE_CODE_RADIUS = 3;

  readonly original: Error;
  readonly template: Template;
  private subTemplates?: Template[];
  private _lineNumber?: number | null;

  constructor(opts: TemplateErrorOptions) {
    super(opts.original.message, { cause: opts.original });
    this.name = "ActionView::Template::Error";
    this.original = opts.original;
    this.template = opts.template;
  }

  backtrace(): string[] {
    const stack = this.original.stack;
    if (stack == null) return [];
    return stack.split("\n").slice(1);
  }

  fileName(): string {
    return this.template.identifier;
  }

  subTemplateMessage(): string {
    if (this.subTemplates) {
      return "Trace of template inclusion: " + this.subTemplates.map((t) => t.inspect()).join(", ");
    }
    return "";
  }

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

  subTemplateOf(templatePath: Template): void {
    this.subTemplates ??= [];
    this.subTemplates.push(templatePath);
  }

  lineNumber(): number | null {
    if (this._lineNumber != null) return this._lineNumber;
    this._lineNumber = null;
    const fileName = this.fileName();
    if (fileName != null) {
      const regexp = new RegExp(`${regexpEscape(File.basename(fileName))}:(\\d+)`);
      const match =
        regexp.exec(this.message) ??
        this.backtrace()
          .map((line) => regexp.exec(line))
          .find((m) => m !== null);
      if (match) this._lineNumber = Number(match[1]);
    }
    return this._lineNumber;
  }

  annotatedSourceCode(): string[] {
    return this.sourceExtract(4);
  }

  private sourceLocation(): string {
    const lineNumber = this.lineNumber();
    return (lineNumber != null ? `on line #${lineNumber} of ` : "in ") + this.fileName();
  }

  private formattedCodeFor(sourceCode: string[], lineCounter: number, indent: number): string[] {
    return sourceCode.map((line) => {
      lineCounter += 1;
      return `${String(lineCounter).padStart(indent)}: ${line}`;
    });
  }
}

export class SyntaxErrorInTemplate extends TemplateError {
  private readonly offendingCodeString: string;

  constructor(template: Template, offendingCodeString: string, original: Error) {
    super({ original, template });
    this.offendingCodeString = offendingCodeString;
    this.name = "ActionView::SyntaxErrorInTemplate";
    this.message = `Encountered a syntax error while rendering template: check ${this.offendingCodeString}\n`;
  }

  override annotatedSourceCode(): string[] {
    return this.offendingCodeString.split("\n").map((line, i) => {
      const indentation = " ".repeat(4);
      return `${i + 1}:${indentation}${line}`;
    });
  }
}
