import type { RenderContext, TemplateHandler } from "../handlers.js";

/**
 * ActionView::Template::Handlers::Raw
 *
 * Passthrough handler used for templates whose source is already the
 * desired output (`.txt`, `.html`, etc.). Rails returns
 * `"#{source.inspect}.html_safe;"` — a literal expression that, when
 * compiled, yields the source string marked html-safe. The TS port skips
 * the codegen indirection and just returns the source verbatim; downstream
 * rendering treats the result as html-safe.
 */
export class Raw implements TemplateHandler {
  readonly extensions = ["raw", "txt", "html", "ruby"];

  /**
   * Rails-named entry point mirroring `Raw#call(template, source)`. The
   * Rails implementation returns `"#{source.inspect}.html_safe;"` — a code
   * fragment evaluated against the compiled template's binding. The TS
   * port short-circuits the codegen step and returns the source directly,
   * since downstream rendering already treats handler output as html-safe.
   *
   * @param _template Unused; mirrors Rails' positional `template` argument.
   * @param source The raw template source.
   */
  call(_template: unknown, source: string): string {
    return source;
  }

  render(source: string, _locals: Record<string, unknown>, _context: RenderContext): string {
    return this.call(undefined, source);
  }
}
