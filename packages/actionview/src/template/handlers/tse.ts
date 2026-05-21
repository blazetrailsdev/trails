import { compileJs, type EmitJsOptions, type EmitResult } from "@blazetrails/tse-compiler";
import type { RenderContext, TemplateHandler } from "../handlers.js";

/**
 * Minimal shape `Tse#call` needs from a template. Mirrors the subset of
 * Rails' `ActionView::Template` that `Handlers::ERB#call` touches:
 * `template.type` (MIME type) drives the `escape_ignore_list` check.
 */
export interface TseTemplate {
  type?: string | null;
}

/**
 * Pluggable compiler. Default is {@link compileJs} from
 * `@blazetrails/tse-compiler`. Rails analogue:
 * `Template::Handlers::ERB.erb_implementation` — swappable in tests and by
 * downstream apps that want a different emitter.
 */
export type TseImplementation = (source: string, options: EmitJsOptions) => EmitResult;

/**
 * ActionView::Template::Handlers::Tse
 *
 * Trails Server Embedded handler — the `.tse` analogue of Rails'
 * `Template::Handlers::ERB`. Reads class-level options, derives per-template
 * compile options from `template.type`, delegates the actual
 * source → JS-code compile to `@blazetrails/tse-compiler` (the `erubi`
 * analogue), and returns the emitted JS module string.
 *
 * Mirrors `actionview/lib/action_view/template/handlers/erb.rb`.
 */
export class Tse implements TemplateHandler {
  readonly extensions = ["tse"];

  /**
   * Trim mode passed to the compiler. Rails default is `"-"` and only `"-"`
   * is wired through; we mirror that for fidelity even though the current
   * tse-compiler always trims `<%- -%>` regardless.
   */
  static trimMode: string = "-";

  /**
   * Template MIME types whose `<%= %>` should NOT HTML-escape. Defaults to
   * `["text/plain"]`. Rails: `escape_ignore_list`.
   */
  static escapeIgnoreList: string[] = ["text/plain"];

  /**
   * When true, `source.chomp` (drop a single trailing newline) is applied
   * before compile. Rails: `strip_trailing_newlines`, default `false`.
   */
  static stripTrailingNewlines: boolean = false;

  /**
   * Swappable compiler implementation. Rails analogue:
   * `erb_implementation = Erubi`.
   */
  static implementation: TseImplementation = compileJs;

  /**
   * Streaming render protocol marker. Mirrors
   * `Template::Handlers::ERB#supports_streaming?`.
   */
  supportsStreaming(): boolean {
    return true;
  }

  /** Mirrors `Template::Handlers::ERB#handles_encoding?`. */
  handlesEncoding(): boolean {
    return true;
  }

  /**
   * Compile a template source to a JS module string. Rails:
   * `Handlers::ERB#call(template, source) → ruby_code_string`.
   */
  call(template: TseTemplate, source: string): string {
    const ctor = this.constructor as typeof Tse;
    const prepared = ctor.stripTrailingNewlines ? source.replace(/\r?\n$/, "") : source;
    const escapeIgnore = template.type != null && ctor.escapeIgnoreList.includes(template.type);
    const result = ctor.implementation(prepared, { escapeIgnore });
    return result.code;
  }

  render(source: string, _locals: Record<string, unknown>, context: RenderContext): string {
    return this.call({ type: context.format ? formatToMimeType(context.format) : null }, source);
  }
}

/**
 * Minimal format → MIME map used only by the {@link Tse#render} convenience
 * adapter to bridge `RenderContext.format` (a Rails format token like
 * `"html"`) into the `template.type` the Rails handler protocol expects.
 * The real lookup lives in `LookupContext` / `Mime::Type`; this is a
 * stopgap until `Template` is wired through.
 *
 * @internal
 */
function formatToMimeType(format: string): string {
  switch (format) {
    case "html":
      return "text/html";
    case "text":
      return "text/plain";
    case "json":
      return "application/json";
    case "xml":
      return "application/xml";
    case "js":
      return "text/javascript";
    case "css":
      return "text/css";
    default:
      return format;
  }
}
