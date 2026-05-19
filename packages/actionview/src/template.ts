/**
 * ActionView::Template — Rails mirror: `action_view/template.rb`.
 *
 * A single template file: source, handler, and metadata (identifier,
 * format, variant, locals). The TS port collapses Rails' compile-then-
 * `module_eval` step into a direct `handler.render(source, locals, ctx)`
 * call — our handler interface already does the compile-and-execute in
 * one shot (see `template/handlers.ts`).
 */
import { TemplateError } from "./template/error.js";
import { TemplateHandlers, type RenderContext, type TemplateHandler } from "./template/handlers.js";

const STRICT_LOCALS_REGEX = /#\s+locals:\s+\((.*)\)/;
const VARIABLE_FROM_BASENAME = /^_?(.*?)(?:\.\w+)*$/;
const NONE = Symbol("Template::NONE");

export interface TemplateOptions {
  source: string;
  identifier: string;
  handler?: TemplateHandler | null;
  locals?: readonly string[];
  format?: string | null;
  variant?: string | null;
  virtualPath?: string | null;
  /** File extension. Rails infers from `handler`; kept here for the
   * resolver's "I just read this file off disk" shortcut. */
  extension?: string;
  fullPath?: string;
  isLayout?: boolean;
  /** Defaults to `basename(virtualPath ?? identifier).startsWith("_")`. */
  isPartial?: boolean;
}

export class Template {
  static Error = TemplateError;

  readonly identifier: string;
  readonly handler: TemplateHandler | null;
  readonly variable: string | null;
  readonly format: string | null;
  readonly variant: string | null;
  readonly virtualPath: string | null;
  readonly extension: string;
  readonly fullPath?: string;
  /** Mutable so resolvers can flip a cached lookup without rebuilding. */
  isLayout: boolean;
  readonly isPartial: boolean;

  private _source: string;
  private readonly _locals: readonly string[];
  private _strictLocals: string | null | typeof NONE = NONE;
  /** @internal */
  _strictLocalKeys: readonly string[] | null = null;
  private _shortIdentifier?: string;

  constructor(opts: TemplateOptions) {
    this._source = opts.source;
    this.identifier = opts.identifier;
    this.handler = opts.handler ?? null;
    this._locals = opts.locals ?? [];
    this.virtualPath = opts.virtualPath ?? null;
    this.format = opts.format ?? null;
    this.variant = opts.variant ?? null;
    this.extension = opts.extension ?? "";
    this.fullPath = opts.fullPath;
    this.isLayout = opts.isLayout ?? false;
    this.isPartial =
      opts.isPartial ?? basename(this.virtualPath ?? this.identifier).startsWith("_");
    this.variable = deriveVariable(this.virtualPath);
  }

  get source(): string {
    return this._source;
  }

  /** Null when the template declares strict locals via the magic comment. */
  get locals(): readonly string[] | null {
    return this.strictLocalsQ() ? null : this._locals;
  }

  /** MIME-type token. Returns the format string until `Mime::Type` lands. */
  get type(): string | null {
    return this.format;
  }

  /** Path with the project-root prefix stripped (no-op until trails has
   * a project-root concept). */
  get shortIdentifier(): string {
    return (this._shortIdentifier ??= this.identifier);
  }

  /** Rails: `supports_streaming?` — true when the handler opts in. */
  supportsStreaming(): boolean {
    const h = this.resolveHandler();
    return Boolean(
      h && (h as { supportsStreaming?: () => boolean }).supportsStreaming?.() === true,
    );
  }

  /**
   * Rails: `Template#strict_locals!`. Lazily strips the
   * `<%# locals: (...) %>` magic comment, memoizes the signature, and
   * returns it. Returns null when the comment is absent.
   */
  strictLocalsBang(): string | null {
    if (this._strictLocals === NONE) {
      const m = STRICT_LOCALS_REGEX.exec(this._source);
      if (m) {
        this._source = this._source.replace(STRICT_LOCALS_REGEX, "");
        const sig = m[1]!.trim();
        this._strictLocals = sig === "" ? "**nil" : sig;
      } else {
        this._strictLocals = null;
      }
    }
    return this._strictLocals;
  }

  /** Rails: `Template#strict_locals?`. */
  strictLocalsQ(): boolean {
    return this.strictLocalsBang() != null;
  }

  /** Render this template. Non-TemplateError failures from the handler
   * are wrapped in {@link TemplateError} so AP's ExceptionWrapper can
   * unwrap to the original cause. */
  async render(
    locals: Record<string, unknown> = {},
    context: Partial<RenderContext> = {},
  ): Promise<string> {
    // Touch strict locals so the magic comment is stripped before the
    // handler sees the source — matches Rails' compile order.
    this.strictLocalsBang();

    const handler = this.resolveHandler();
    if (!handler) {
      throw new Error(
        `No template handler registered for ".${this.extension}". ` +
          `Register one with TemplateHandlers.registerTemplateHandler(ext, handler).`,
      );
    }

    try {
      return await handler.render(this._source, locals, {
        ...context,
        controller: context.controller ?? "",
        action: context.action ?? "",
        format: context.format ?? this.format ?? "",
        yield: context.yield,
        templatePath: context.templatePath ?? this.fullPath ?? this.identifier,
      });
    } catch (e) {
      if (e instanceof TemplateError) throw e;
      const original = e instanceof Error ? e : new Error(String(e));
      throw new TemplateError({ original, template: this });
    }
  }

  inspect(): string {
    const locals = this._locals.length > 0 ? `[:${this._locals.join(", :")}]` : "[]";
    return `#<Template ${this.shortIdentifier} locals=${locals}>`;
  }

  toString(): string {
    return this.inspect();
  }

  /** Shallow copy with `isLayout = true`. Resolvers use this when a
   * cached lookup needs to be served as a layout wrapper. */
  asLayout(): Template {
    return new Template({
      source: this._source,
      identifier: this.identifier,
      handler: this.handler,
      locals: this._locals,
      format: this.format,
      variant: this.variant,
      virtualPath: this.virtualPath,
      extension: this.extension,
      fullPath: this.fullPath,
      isPartial: this.isPartial,
      isLayout: true,
    });
  }

  /** @internal */
  private resolveHandler(): TemplateHandler | undefined {
    return this.handler ?? TemplateHandlers.handlerForExtension(this.extension);
  }
}

function deriveVariable(virtualPath: string | null): string | null {
  if (!virtualPath) return null;
  const base = virtualPath.endsWith("/") ? "" : basename(virtualPath);
  const m = VARIABLE_FROM_BASENAME.exec(base);
  return m?.[1] || null;
}

function basename(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? path : path.slice(slash + 1);
}
