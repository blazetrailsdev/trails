/**
 * Wraps an error raised while compiling/rendering a Template. AP's
 * ExceptionWrapper unwraps this to surface the original cause to the
 * debug view. Annotated-source extraction + line-number recovery lands
 * in Phase 1b.
 *
 * @internal stub - real impl in Phase 1b
 */

import type { Template } from "../template.js";

export interface TemplateErrorOptions {
  original: Error;
  template: Template;
  sourceExtract?: string;
}

export class TemplateError extends Error {
  /** @internal stub - real impl in Phase 1b */
  readonly original: Error;
  /** @internal stub - real impl in Phase 1b */
  readonly template: Template;
  /** @internal stub - real impl in Phase 1b */
  readonly sourceExtract: string;
  /** Mirrors `@sub_templates` (`template/error.rb:219`). */
  private subTemplates?: Template[];

  constructor(opts: TemplateErrorOptions) {
    super(opts.original.message, { cause: opts.original });
    this.name = "ActionView::Template::Error";
    this.original = opts.original;
    this.template = opts.template;
    this.sourceExtract = opts.sourceExtract ?? "";
  }

  /** Mirrors `Template::Error#sub_template_of(template_path)` (`template/error.rb:218-221`). */
  subTemplateOf(templatePath: Template): void {
    this.subTemplates ??= [];
    this.subTemplates.push(templatePath);
  }
}

/**
 * Mirrors `ActionView::SyntaxErrorInTemplate` (`template/error.rb:256-266`) —
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
}
