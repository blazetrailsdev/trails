import type { TemplateHandler } from "../handlers.js";

/**
 * ActionView::Template::Handlers::Raw
 *
 * Passthrough handler used for templates whose source is already the
 * desired output (`.txt`, `.html`, etc.). Rails returns
 * `"#{source.inspect}.html_safe;"` — a literal expression that, when
 * compiled, yields the source string marked html-safe.
 */
export class Raw implements TemplateHandler {
  readonly extensions = ["raw", "txt", "html", "ruby"];

  /**
   * Mirrors `Raw#call(template, source)` — `"#{source.inspect}.html_safe;"`,
   * a code fragment evaluated against the compiled template's binding.
   * `html_safe` is a `String` method in Ruby and a function in trails, so the
   * receiver moves to the argument position.
   *
   * @param _template Unused; mirrors Rails' positional `template` argument.
   * @param source The raw template source.
   */
  call(_template: unknown, source: string): string {
    return `htmlSafe(${JSON.stringify(source)});`;
  }
}
