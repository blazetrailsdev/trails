import {
  Collector as DispatchCollector,
  type FormatHandler,
} from "../../action-dispatch/respond-to.js";
import { UnknownFormat } from "./exceptions.js";
import { symbolToS } from "@blazetrails/ruby-compat";
export { type FormatHandler };

export class Collector extends DispatchCollector {
  private _requestVariant: string | string[] | null;
  private _response: FormatHandler | undefined;

  constructor(mimes: string[] = [], variant: string | string[] | null = null) {
    super();
    this._requestVariant = variant;
    for (const mime of mimes) this.custom(mime);
  }

  get format(): string | null {
    return this.resolvedFormat;
  }

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

  all(...args: (string | FormatHandler | undefined)[]): this {
    return this.any(...args);
  }

  custom(mimeType: string, handler?: FormatHandler): this {
    return this.on(mimeType, handler);
  }

  override on(format: string, handler?: FormatHandler): this {
    if (this.handlerFor(format)) return this;
    return super.on(format, handler);
  }

  isAnyResponse(): boolean {
    return !this.handlerFor(this.format) && this.hasAnyHandler;
  }

  negotiateFormat(request: {
    accept?: string;
    format?: string | { symbol?: string | null } | null;
    variant?: unknown;
  }): string | null {
    const requested = Array.isArray(request.variant) ? request.variant[0] : request.variant;
    const variant =
      (typeof requested === "string" ? requested : undefined) ??
      (Array.isArray(this._requestVariant) ? this._requestVariant[0] : this._requestVariant) ??
      undefined;
    const format =
      typeof request.format === "string"
        ? request.format
        : request.format?.symbol != null
          ? symbolToS(request.format.symbol)
          : undefined;
    const result = this.negotiate({ accept: request.accept || undefined, format, variant });
    this._response = result?.handler;
    return result?.format ?? null;
  }

  /**
   * @missingRailsCall fetch — PERMANENT
   * @missingRailsCall new — CONVERGEABLE collector-response-drops-the-variant-collector-arms
   */
  get response(): FormatHandler | undefined {
    return this._response;
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
