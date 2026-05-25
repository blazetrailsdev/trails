import { chomp } from "@blazetrails/activesupport";
import { compileJs, type EmitJsOptions, type EmitResult } from "@blazetrails/tse-compiler";
import { Base } from "../../base.js";
import type { RenderContext, TemplateHandler } from "../handlers.js";
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

/**
 * Minimal shape `Tse#call` needs from a template. Mirrors the subset of
 * Rails' `ActionView::Template` that `Handlers::ERB#call` touches:
 * `template.type` (MIME type) drives the `escape_ignore_list` check;
 * `template.format` and `template.shortIdentifier` drive annotation comments.
 */
export interface TseTemplate {
  type?: string | null;
  format?: string | null;
  shortIdentifier?: string | null;
}

/**
 * Pluggable compiler. Default is {@link compileJs} from
 * `@blazetrails/tse-compiler`. Rails analogue:
 * `Template::Handlers::ERB.erb_implementation` — swappable in tests and by
 * downstream apps that want a different emitter.
 */
export type TseImplementation = (source: string, options?: EmitJsOptions) => EmitResult;

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
   * Trim mode (Rails: `erb_trim_mode`). API-surface parity only — Rails wires
   * this through to Erubi, but `@blazetrails/tse-compiler` v0.1.0 hard-codes
   * `-` trimming (the only mode Rails ever passes). The attribute is exposed
   * now so downstream code that mirrors Rails patterns (`Tse.trimMode = "-"`)
   * doesn't crash; it becomes load-bearing once tse-compiler accepts a `trim`
   * option.
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
   * Class-level convenience. Mirrors `Handlers::ERB.call` which does
   * `new.call(template, source)`. `Template::Handlers` registers the
   * class itself in Rails; calling `Tse.call(template, source)` matches
   * that protocol without forcing callers to construct an instance.
   */
  static call(template: TseTemplate, source: string): string {
    return new this().call(template, source);
  }

  /** Mirrors `Template::Handlers::ERB#supports_streaming?` — instance
   *  method, per Rails. */
  supportsStreaming(): boolean {
    return true;
  }

  /** Mirrors `Template::Handlers::ERB#handles_encoding?` — instance method. */
  handlesEncoding(): boolean {
    return true;
  }

  /**
   * Translate a `ErrorHighlight`-shaped spot back to a source-line/column
   * inside the `.tse` template. Mirrors
   * `Template::Handlers::ERB#translate_location(spot, backtrace_location, source)`
   * 1:1 — the algorithm is delegated to {@link translateLocationImpl}, which
   * ports `find_offset` / `offset_source_tokens` from `erb.rb`. Returns the
   * mutated spot on success, `null` if the line is past EOF or the snippet
   * can't be anchored.
   */
  translateLocation(spot: Spot, backtraceLocation: BacktraceLocation, source: string): Spot | null {
    return translateLocationImpl(spot, backtraceLocation, source);
  }

  /**
   * Compile a template source to a JS module string. Rails:
   * `Handlers::ERB#call(template, source) → ruby_code_string`.
   *
   * Encoding-tag handling: Rails strips a leading magic `# encoding:` line
   * before passing source to Erubi. `.tse` source is JavaScript/TypeScript,
   * which has no encoding pragma (files are always UTF-8 by spec), so this
   * step is a documented no-op — there is nothing to strip.
   */
  call(template: TseTemplate, source: string): string {
    const ctor = this.constructor as typeof Tse;
    const prepared = ctor.stripTrailingNewlines ? chomp(source) : source;
    // Rails compares `template.type` (a MIME string like "text/html") against
    // `escape_ignore_list`. Trails' `Template#type` currently returns the
    // format token ("html") until `Mime::Type` lands — normalize both forms
    // here so the Rails-shape default `["text/plain"]` matches regardless.
    const mime = template.type != null ? formatToMimeType(template.type) : null;
    const escapeIgnore = mime != null && ctor.escapeIgnoreList.includes(mime);
    const options: EmitJsOptions = { escapeIgnore };
    // Rails erb.rb lines 86–89: annotate HTML output with BEGIN/END comments
    // when ActionView::Base.annotate_rendered_view_with_filenames is on.
    const format = template.format ?? (mime === "text/html" ? "html" : null);
    if (Base.annotateRenderedViewWithFilenames && format === "html" && template.shortIdentifier) {
      const id = template.shortIdentifier;
      options.preamble = `_ob.safeAppend(${JSON.stringify(`<!-- BEGIN ${id} -->`)});`;
      options.postamble = `_ob.safeAppend(${JSON.stringify(`<!-- END ${id} -->`)});`;
    }
    const result = ctor.implementation(prepared, options);
    return result.code;
  }

  /**
   * Not yet executable. Rails' handler protocol returns compiled code from
   * `call(...)`; turning that code into an output string requires the
   * runtime substrate (`OutputBuffer`, view context, compiled-template
   * module loader) that Phase 2c wires up. Returning the JS source from
   * `render` would be a footgun — a renderer would write template source
   * into the response body. Throw until execution lands.
   */
  render(_source: string, _locals: Record<string, unknown>, _context: RenderContext): string {
    throw new Error(
      "Tse#render is not yet implemented — `.tse` execution lands in Phase 2c. " +
        "Use `Tse#call(template, source)` to get the compiled JS module source.",
    );
  }
}

/**
 * Normalize a `template.type` input into a MIME string. Rails compares the
 * `escape_ignore_list` (default `["text/plain"]`) against `Template#type`,
 * which already returns a MIME string. Trails' `Template#type` currently
 * returns the format token (e.g. `"html"`) until `Mime::Type` lands, so we
 * widen the input here: pass-through for MIMEs, map known tokens to MIME.
 * Unknown tokens pass through unchanged so they still miss the ignore list.
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
