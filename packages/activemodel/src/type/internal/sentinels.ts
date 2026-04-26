/**
 * Sentinel values for Postgres out-of-range datetime literals.
 * Postgres can return 'infinity' / '-infinity' for timestamp/date columns;
 * these have no Temporal equivalent.
 *
 * Symbol.for ensures identity is stable across module duplication (pnpm
 * deduplication quirks, bundlers). The branded type ensures the two sentinels
 * remain nominally distinct even though both are plain `symbol` at runtime.
 */

declare const dateInfinityBrand: unique symbol;
declare const dateNegativeInfinityBrand: unique symbol;

export type DateInfinity = symbol & { readonly [dateInfinityBrand]: "DateInfinity" };
export type DateNegativeInfinity = symbol & {
  readonly [dateNegativeInfinityBrand]: "DateNegativeInfinity";
};

export const DateInfinity: DateInfinity = Symbol.for(
  "@blazetrails/activemodel:DateInfinity",
) as DateInfinity;

export const DateNegativeInfinity: DateNegativeInfinity = Symbol.for(
  "@blazetrails/activemodel:DateNegativeInfinity",
) as DateNegativeInfinity;

export function isDateInfinity(v: unknown): v is DateInfinity {
  return v === DateInfinity;
}

export function isDateNegativeInfinity(v: unknown): v is DateNegativeInfinity {
  return v === DateNegativeInfinity;
}
