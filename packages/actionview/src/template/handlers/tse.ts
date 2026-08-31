import { chomp } from "@blazetrails/activesupport";
import { compileJs, type EmitJsOptions, type EmitResult } from "@blazetrails/tse-compiler";
import { Base, type CompiledMethod } from "../../base.js";
import { OutputBuffer } from "../../buffers.js";
import { StrictLocalsMismatch } from "../../strict-locals.js";
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
   * Compile the template and run it against the view, returning its output.
   *
   * Rails splits this across `Template#compile!`
   * (`actionview/lib/action_view/template.rb:418-438`), which `module_eval`s
   * the handler's code into a real method on `view.compiled_method_container`
   * and memoizes on `@compiled`, and `Template#render` (`:271-287`), which
   * calls `view._run(method_name, self, locals, OutputBuffer.new)`.
   *
   * The method is defined ON THE VIEW, so inside a template `self` is the
   * `ActionView::Base` and every helper is an ordinary method call on it;
   * `locals_code` (`:561-572`) then assigns each local as a real local
   * variable, which is why a local shadows a same-named helper. `with (this)`
   * nested inside `with (localAssigns)` is the JS construct with that
   * resolution order — Ruby's implicit `self` receiver has no other analogue.
   */
  render(source: string, locals: Record<string, unknown>, context: RenderContext): string {
    const view = context.view ?? new (Base.withEmptyTemplateCache())(null, {}, null);
    // Rails' `TemplateRenderer#render_with_layout` puts the inner template's
    // output in the view flow (`view.view_flow.set(:layout, content)`), which
    // is where `_layout_for` — and so `<%= yield %>` — reads it from.
    if (context.yield !== undefined) view.viewFlow.set("layout", context.yield);
    const method = this.compiled(source, context, view);
    const buffer = new OutputBuffer();
    view._run(method, context.template ?? null, locals, buffer);
    return buffer.toStr();
  }

  /**
   * Mirrors `Template#compile!` (`template.rb:418-438`): compile once per
   * `compiled_method_container`, keyed on the emitted code so a handler-option
   * change (`escapeIgnoreList`, annotation) defines a fresh method. The memo
   * lives on the container, as Rails' does, rather than in a process-global
   * cache.
   *
   * @internal
   */
  private compiled(source: string, context: RenderContext, view: Base): CompiledMethod {
    const code = this.call(
      { type: context.format, format: context.format, shortIdentifier: context.templatePath },
      source,
    );
    const container = view.compiledMethodContainer();
    // Rails keys on `method_name`, which folds in the identifier
    // (`template.rb:396-402`); the virtual path is baked into the method body,
    // so it belongs in the key alongside the emitted code.
    // Rails emits `@virtual_path` verbatim; trails resolvers do not all
    // populate it, so the identifier stands in when they don't.
    const virtualPath = context.template?.virtualPath ?? context.template?.identifier ?? null;
    const key = `${virtualPath ?? ""}\u0000${code}`;
    let method = container._compiledMethods.get(key);
    if (!method) {
      method = evaluateTemplate(code, virtualPath, context.templatePath);
      container._compiledMethods.set(key, method);
    }
    return method;
  }
}

/**
 * Turn the emitted ES-module source into the function `compile!` would have
 * defined on the view. The compiler emits
 * `export default function render(context, locals)`, optionally preceded by an
 * `import` of `StrictLocalsMismatch`; strip both so the remainder is a
 * function expression.
 *
 * The emitted name `render` is renamed on the way: as a function *expression*
 * it would bind inside the function's own scope and shadow the view's `render`
 * helper, so `<%= render({ partial: … }) %>` would recurse into the template.
 *
 * `@virtual_path = …` is emitted as the method's first statement, exactly where
 * `compiled_source` puts it (`template.rb:461`). It has to be set by the method
 * rather than by the caller, because `_run` captures the previous value before
 * invoking it — that ordering is what restores the parent's path when a nested
 * partial returns.
 *
 * `localAssigns` is passed through unchanged — the strict-locals check the
 * compiler emits compares `Object.keys(localAssigns)` against the declared
 * signature, so the view must not stand in for it.
 *
 * @internal
 */
function evaluateTemplate(
  code: string,
  virtualPath: string | null,
  templatePath?: string,
): CompiledMethod {
  const expression = code
    .replace(/^import\s+\{[^}]*\}\s+from\s+"[^"]*";\n?/u, "")
    .replace(/^\s*export\s+default\s+/u, "")
    .replace(/^function\s+render\b/u, "function __tseCompiled");
  try {
    const factory = new Function(
      "StrictLocalsMismatch",
      `return function (localAssigns, outputBuffer) {
         this.virtualPath = ${JSON.stringify(virtualPath)};
         with (this) { with (localAssigns) {
           var __tseTemplate = ${expression};
           return __tseTemplate(this, localAssigns);
         } }
       };`,
    ) as (mismatch: typeof StrictLocalsMismatch) => CompiledMethod;
    return factory(StrictLocalsMismatch);
  } catch (error) {
    const where = templatePath != null ? ` (${templatePath})` : "";
    throw new SyntaxError(`Failed to compile .tse template${where}: ${(error as Error).message}`, {
      cause: error,
    });
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
