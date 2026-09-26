import {
  Collector as DispatchCollector,
  type FormatHandler,
} from "../../action-dispatch/respond-to.js";
import { RespondToMismatchError, UnknownFormat } from "./exceptions.js";
import { _processFormat } from "../../abstract-controller/rendering.js";
import { _setRenderedContentType } from "./rendering.js";
import { ArgumentError, rbEqual, symbolToS } from "@blazetrails/ruby-compat";
export { type FormatHandler };

type VariantBlock = (variant: VariantCollector) => unknown;
type Response = FormatHandler | VariantBlock | VariantCollector;

export class Collector extends DispatchCollector<Response> {
  #variant: readonly string[] | null;
  private _response: Response | undefined;

  constructor(mimes: string[] = [], variant: readonly string[] | null = null) {
    super();
    this.#variant = variant;
    for (const mime of mimes) this.custom(mime);
  }

  get format(): string | null {
    return this.resolvedFormat;
  }

  override any(...args: (string | Response | undefined)[]): this {
    const last = args[args.length - 1];
    const handler = typeof last === "function" ? (args.pop() as FormatHandler) : undefined;
    const types = args.filter((arg): arg is string => typeof arg === "string");

    if (types.length > 0) {
      for (const type of types) {
        this.custom(type, handler);
      }
      return this;
    }
    return super.any(handler ?? new VariantCollector(this.#variant));
  }

  all(...args: (string | Response | undefined)[]): this {
    return this.any(...args);
  }

  custom(mimeType: string, block?: FormatHandler | VariantBlock): Response {
    let response = this.handlerFor(mimeType);
    if (!response) {
      response = block ?? new VariantCollector(this.#variant);
      super.on(mimeType, response);
    }
    return response;
  }

  override on(format: string, handler?: Response): this {
    this.custom(format, handler as FormatHandler | VariantBlock | undefined);
    return this;
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
      (typeof requested === "string" ? requested : undefined) ?? this.#variant?.[0] ?? undefined;
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

  /** @missingRailsCall fetch — PERMANENT */
  get response(): FormatHandler | undefined {
    const response = this._response;
    if (response instanceof VariantCollector) {
      return response.variant;
    } else if (response == null || response.length === 0) {
      return response as FormatHandler | undefined;
    } else {
      const variantCollector = new VariantCollector(this.#variant);
      response.call(null, variantCollector);
      return variantCollector.variant;
    }
  }
}

export function respondTo(
  this: {
    request?: { variant?: readonly string[] | null; accept?: string } | null;
    mediaType?: string | null;
    contentType: string | null;
    response: { contentType?: string };
  },
  ...mimes: Array<string | ((collector: Collector) => void)>
): void {
  const last = mimes[mimes.length - 1];
  const block = typeof last === "function" ? (mimes.pop() as (c: Collector) => void) : undefined;
  if (mimes.length > 0 && block) {
    throw new ArgumentError("respond_to takes either types or a block, never both");
  }

  const collector = new Collector(mimes as string[], this.request?.variant ?? null);
  if (block) block(collector);

  const format = collector.negotiateFormat(this.request ?? {});
  if (format != null) {
    if (this.mediaType && this.mediaType !== format) {
      throw new RespondToMismatchError();
    }
    _processFormat.call(this, format);
    if (!collector.isAnyResponse()) _setRenderedContentType.call(this, format);
    const response = collector.response;
    if (response) response();
  } else {
    throw new UnknownFormat();
  }
}

export class VariantCollector {
  private _variant: readonly string[] | null;
  private _variants = new Map<string, FormatHandler>();

  constructor(variant: readonly string[] | null = null) {
    this._variant = variant;
    return new Proxy(this, VARIANT_COLLECTOR_HANDLER) as this;
  }

  any(...args: (string | FormatHandler)[]): void {
    const last = args[args.length - 1];
    const block = typeof last === "function" ? (args.pop() as FormatHandler) : undefined;
    const variants = args as string[];
    if (block) {
      if (variants.length > 0 && !variants.some((a) => rbEqual(a, this._variant))) {
        for (const v of variants) this._variants.set(v, block);
      } else {
        this._variants.set("any", block);
      }
    }
  }

  all(...args: (string | FormatHandler)[]): void {
    this.any(...args);
  }

  methodMissing(name: string, block?: FormatHandler): void {
    if (block) this._variants.set(name, block);
  }

  get variant(): FormatHandler | undefined {
    if (this._variant!.length === 0) {
      return this._variants.get("none") ?? this._variants.get("any");
    } else {
      return this._variants.get(this.variantKey());
    }
  }

  /** @internal */
  private variantKey(): string {
    return this._variant!.find((variant) => this._variants.has(variant)) ?? "any";
  }
}

const RESERVED_KEYS = new Set<string | symbol>(["then", "catch", "finally", "toJSON", "inspect"]);

const VARIANT_COLLECTOR_HANDLER: ProxyHandler<VariantCollector> = {
  get(target, prop, receiver) {
    if (Reflect.has(target, prop)) return Reflect.get(target, prop, receiver);
    if (RESERVED_KEYS.has(prop) || typeof prop !== "string") return undefined;
    return (block?: FormatHandler): void => target.methodMissing(prop, block);
  },
};
