import {
  Collector as DispatchCollector,
  type FormatHandler,
} from "../../action-dispatch/respond-to.js";
import { UnknownFormat } from "./exceptions.js";
export { type FormatHandler };

export class Collector extends DispatchCollector {
  private _requestVariant: string | string[] | null;

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

  negotiateFormat(request: { accept?: string; format?: string; variant?: string }): string | null {
    const variant =
      request.variant ??
      (Array.isArray(this._requestVariant) ? this._requestVariant[0] : this._requestVariant) ??
      undefined;
    const result = this.negotiate({ accept: request.accept, format: request.format, variant });
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
