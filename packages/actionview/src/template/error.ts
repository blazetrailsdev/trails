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

  constructor(opts: TemplateErrorOptions) {
    super(opts.original.message, { cause: opts.original });
    this.name = "ActionView::Template::Error";
    this.original = opts.original;
    this.template = opts.template;
    this.sourceExtract = opts.sourceExtract ?? "";
  }
}
