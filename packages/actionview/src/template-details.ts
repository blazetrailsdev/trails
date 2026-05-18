/**
 * ActionView::TemplateDetails
 *
 * The `{locale, handler, format, variant}` tuple used by LookupContext keying
 * to match concrete templates against a `Requested` set.
 */

import type { TemplateHandler } from "./template-handler.js";
import { TemplateHandlerRegistry } from "./template-handler.js";

export type DetailKey = string | symbol | null;

export interface RequestedInit {
  locale: ReadonlyArray<DetailKey>;
  handlers: ReadonlyArray<DetailKey>;
  formats: ReadonlyArray<DetailKey>;
  variants: ReadonlyArray<DetailKey> | "any";
}

/** Sentinel for `variants: :any` — every variant matches with score 1. */
const ANY = Symbol.for("ActionView::TemplateDetails::ANY");

export class Requested {
  readonly locale: ReadonlyArray<DetailKey>;
  readonly handlers: ReadonlyArray<DetailKey>;
  readonly formats: ReadonlyArray<DetailKey>;
  readonly variants: ReadonlyArray<DetailKey> | "any";

  readonly localeIdx: ReadonlyMap<DetailKey, number>;
  readonly handlersIdx: ReadonlyMap<DetailKey, number>;
  readonly formatsIdx: ReadonlyMap<DetailKey, number>;
  readonly variantsIdx: ReadonlyMap<DetailKey, number> | "any";

  constructor({ locale, handlers, formats, variants }: RequestedInit) {
    this.locale = locale;
    this.handlers = handlers;
    this.formats = formats;
    this.variants = variants;

    this.localeIdx = this.buildIdxHash(locale);
    this.handlersIdx = this.buildIdxHash(handlers);
    this.formatsIdx = this.buildIdxHash(formats);
    this.variantsIdx = variants === "any" ? "any" : this.buildIdxHash(variants);
  }

  /**
   * @internal
   * Builds the `value -> idx` lookup map (Rails `build_idx_hash`). Includes
   * `null` as a trailing entry so unspecified facets still resolve.
   */
  private buildIdxHash(arr: ReadonlyArray<DetailKey>): ReadonlyMap<DetailKey, number> {
    const m = new Map<DetailKey, number>();
    let i = 0;
    for (const v of arr) {
      if (!m.has(v)) m.set(v, i++);
    }
    if (!m.has(null)) m.set(null, i);
    return m;
  }

  /** @internal */
  private idxFor(map: ReadonlyMap<DetailKey, number> | "any", key: DetailKey): number | undefined {
    if (map === "any") return key === null ? 0 : 1;
    return map.get(key);
  }

  /** @internal */
  lookupVariant(key: DetailKey): number | undefined {
    return this.idxFor(this.variantsIdx, key);
  }
}

export class TemplateDetails {
  readonly locale: DetailKey;
  readonly handler: DetailKey;
  readonly format: DetailKey;
  readonly variant: DetailKey;

  constructor(locale: DetailKey, handler: DetailKey, format: DetailKey, variant: DetailKey) {
    this.locale = locale;
    this.handler = handler;
    this.format = format;
    this.variant = variant;
  }

  matches(requested: Requested): boolean {
    return (
      requested.formatsIdx.get(this.format) !== undefined &&
      requested.localeIdx.get(this.locale) !== undefined &&
      requested.lookupVariant(this.variant) !== undefined &&
      requested.handlersIdx.get(this.handler) !== undefined
    );
  }

  sortKeyFor(requested: Requested): [number, number, number, number] {
    return [
      requested.formatsIdx.get(this.format) ?? Number.MAX_SAFE_INTEGER,
      requested.localeIdx.get(this.locale) ?? Number.MAX_SAFE_INTEGER,
      requested.lookupVariant(this.variant) ?? Number.MAX_SAFE_INTEGER,
      requested.handlersIdx.get(this.handler) ?? Number.MAX_SAFE_INTEGER,
    ];
  }

  /**
   * Look up the handler registered for this template's extension.
   * Mirrors Rails `Template.handler_for_extension`.
   */
  handlerClass(): TemplateHandler | undefined {
    if (typeof this.handler !== "string") return undefined;
    return TemplateHandlerRegistry.handlerForExtension(this.handler);
  }

  /**
   * Format if set, else fall back to the handler's `defaultFormat`. Used by
   * `LookupContext` when callers omit an explicit format.
   */
  formatOrDefault(): DetailKey {
    if (this.format !== null) return this.format;
    const handler = this.handlerClass() as
      | (TemplateHandler & { defaultFormat?: string })
      | undefined;
    return handler?.defaultFormat ?? null;
  }
}

export { ANY as AnyVariants };
