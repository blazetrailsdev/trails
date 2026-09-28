import { Collector as AbstractCollector } from "../../abstract-controller/collector.js";
import { Mime, MimeType } from "../../action-dispatch/http/mime-type.js";
import type { NullType } from "../../action-dispatch/http/mime-negotiation.js";
import { RespondToMismatchError, UnknownFormat } from "./exceptions.js";
import { _setRenderedContentType } from "./rendering.js";
import { ArgumentError, fetch, rbEqual } from "@blazetrails/ruby-compat";

export type FormatHandler = () => unknown;
type VariantBlock = (variant: VariantCollector) => unknown;
type Response = FormatHandler | VariantBlock | VariantCollector;
type Format = MimeType | NullType;
type MimeMethod = (block?: FormatHandler | VariantBlock) => Response;

export class Collector extends AbstractCollector {
  format: Format | null = null;
  #responses: Map<Format | null | undefined, Response | null>;
  #variant: readonly string[] | null;

  constructor(mimes: string[] = [], variant: readonly string[] | null = null) {
    super();
    this.#responses = new Map();
    this.#variant = variant;

    for (const mime of mimes) this.#responses.set(Mime.get(mime), null);
  }

  any(...args: (string | FormatHandler | VariantBlock)[]): Response | string[] {
    const last = args[args.length - 1];
    const block =
      typeof last === "function" ? (args.pop() as FormatHandler | VariantBlock) : undefined;
    if (args.length > 0) {
      for (const type of args as string[]) {
        (this as unknown as Record<string, (block?: unknown) => Response>)[type](block);
      }
      return args as string[];
    } else {
      return this.custom(MimeType.ALL, block);
    }
  }

  all(...args: (string | FormatHandler | VariantBlock)[]): Response | string[] {
    return this.any(...args);
  }

  custom(mimeType: MimeType | string, block?: FormatHandler | VariantBlock): Response {
    if (!(mimeType instanceof MimeType)) mimeType = MimeType.lookup(String(mimeType));
    let response = this.#responses.get(mimeType);
    if (response == null) {
      response = block ?? new VariantCollector(this.#variant);
      this.#responses.set(mimeType, response);
    }
    return response;
  }

  isAnyResponse(): boolean {
    const own = fetch(this.#responses, this.format, false);
    return !(own != null && own !== false) && this.#responses.get(MimeType.ALL) != null;
  }

  get response(): FormatHandler | null | undefined {
    const response = fetch(this.#responses, this.format, this.#responses.get(MimeType.ALL));
    if (response instanceof VariantCollector) {
      return response.variant;
    } else if (response == null || response.length === 0) {
      return response as FormatHandler | null | undefined;
    } else {
      const variantCollector = new VariantCollector(this.#variant);
      response.call(null, variantCollector);
      return variantCollector.variant;
    }
  }

  negotiateFormat(request: { negotiateMime(order: MimeType[]): Format | null }): Format | null {
    return (this.format = request.negotiateMime([...this.#responses.keys()] as MimeType[]));
  }
}

export function respondTo(
  this: {
    request: {
      variant?: readonly string[] | null;
      negotiateMime(order: MimeType[]): Format | null;
    };
    mediaType?: string | null;
    contentType: string | null;
    response: { contentType?: string; mediaType?: string | null };
    _processFormat(format: Format): void;
  },
  ...mimes: Array<string | ((collector: Collector & Record<string, MimeMethod>) => void)>
): unknown {
  const last = mimes[mimes.length - 1];
  const block =
    typeof last === "function"
      ? (mimes.pop() as (c: Collector & Record<string, MimeMethod>) => void)
      : undefined;
  if (mimes.length > 0 && block) {
    throw new ArgumentError("respond_to takes either types or a block, never both");
  }

  const collector = new Collector(mimes as string[], this.request.variant ?? null);
  if (block) block(collector as Collector & Record<string, MimeMethod>);

  const format = collector.negotiateFormat(this.request);
  if (format != null) {
    if (this.mediaType && !rbEqual(this.mediaType, format)) {
      throw new RespondToMismatchError();
    }
    this._processFormat(format);
    if (!collector.isAnyResponse()) _setRenderedContentType.call(this, format);
    const response = collector.response;
    if (response) return response();
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
    if (block) {
      if (args.length > 0 && !args.some((a) => rbEqual(a, this._variant))) {
        for (const v of args as string[]) this._variants.set(v, block);
      } else {
        this._variants.set(":any", block);
      }
    }
  }

  all(...args: (string | FormatHandler)[]): void {
    this.any(...args);
  }

  methodMissing(name: string, block?: FormatHandler): void {
    if (block) this._variants.set(`:${name}`, block);
  }

  get variant(): FormatHandler | undefined {
    if (this._variant!.length === 0) {
      return this._variants.get(":none") ?? this._variants.get(":any");
    } else {
      return this._variants.get(this.variantKey());
    }
  }

  /** @internal */
  private variantKey(): string {
    return this._variant!.find((variant) => this._variants.has(variant)) ?? ":any";
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
