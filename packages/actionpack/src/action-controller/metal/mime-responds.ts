/**
 * ActionController::MimeResponds
 *
 * Content negotiation via respond_to blocks. Exposes an ActionController
 * Collector that wraps ActionDispatch's implementation for API compatibility
 * and future extensions.
 * @see https://api.rubyonrails.org/classes/ActionController/MimeResponds.html
 */

import {
  Collector as DispatchCollector,
  type FormatHandler,
} from "../../action-dispatch/respond-to.js";
import { UnknownFormat } from "./exceptions.js";
export { type FormatHandler };

export class Collector extends DispatchCollector {
  private _requestVariant: string | string[] | null;

  /**
   * Mirrors: `Collector#initialize` (`metal/mime_responds.rb:255-260`), which
   * seeds a response slot for each mime `respond_to` was called with.
   */
  constructor(mimes: string[] = [], variant: string | string[] | null = null) {
    super();
    this._requestVariant = variant;
    for (const mime of mimes) this.custom(mime);
  }

  /**
   * Negotiates against the variant the collector was constructed with
   * (`@variant`, `metal/mime_responds.rb:255-257`), which Rails' own
   * `negotiate_format(request)` (`mime_responds.rb:297-299`) consults.
   */
  override negotiate(
    options: { accept?: string; format?: string; variant?: string } = {},
  ): ReturnType<DispatchCollector["negotiate"]> {
    const variant = Array.isArray(this._requestVariant)
      ? this._requestVariant[0]
      : this._requestVariant;
    return super.negotiate({ variant: variant ?? undefined, ...options });
  }

  get format(): string | null {
    return this.resolvedFormat;
  }

  /**
   * With format arguments, register `handler` for each named format; with none,
   * register the catch-all. Mirrors Rails' `send(type, &block)` dispatch, which
   * routes every named format through `custom`.
   */
  override any(...args: (string | FormatHandler | undefined)[]): this {
    const last = args[args.length - 1];
    const handler = typeof last === "function" ? (args.pop() as FormatHandler) : undefined;
    const types = args.filter((arg): arg is string => typeof arg === "string");

    if (types.length > 0) {
      for (const type of types) {
        this.custom(type, handler);
      }
      return this;
    }
    return super.any(handler);
  }

  /** Alias of {@link any}, mirroring Rails' `alias :all :any`. */
  all(...args: (string | FormatHandler | undefined)[]): this {
    return this.any(...args);
  }

  custom(mimeType: string, handler?: FormatHandler): this {
    return this.on(mimeType, handler);
  }

  /**
   * First registration wins, mirroring Rails' `@responses[mime_type] ||= ...`
   * in `custom` (mime_responds.rb:271). Every format method funnels through
   * `custom` in Rails (abstract_controller/collector.rb:9-15), so the
   * first-wins rule covers `format.html` as well as explicit `custom` calls.
   */
  override on(format: string, handler?: FormatHandler): this {
    if (this.handlerFor(format)) return this;
    return super.on(format, handler);
  }

  isAnyResponse(): boolean {
    return !this.handlerFor(this.format) && this.hasAnyHandler;
  }

  negotiateFormat(request: { accept?: string; format?: string }): string | null {
    const result = this.negotiate({ accept: request.accept, format: request.format });
    return result?.format ?? null;
  }
}

export function respondTo(
  block: (collector: Collector) => void,
  options: { accept?: string; format?: string; variant?: string } = {},
): unknown {
  const collector = new Collector();
  block(collector);

  const result = collector.negotiate(options);
  if (!result) {
    throw new UnknownFormat();
  }

  return result.handler();
}

export class VariantCollector {
  private _variants = new Map<string, () => void>();

  variant(name: string, handler: () => void): void {
    this._variants.set(name, handler);
  }

  get(name: string): (() => void) | undefined {
    return this._variants.get(name);
  }
}
