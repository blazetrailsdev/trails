/**
 * Sentinel values for Postgres out-of-range datetime literals.
 * Postgres can return 'infinity' / '-infinity' for timestamp/date columns;
 * these have no Temporal equivalent.
 *
 * Mirrors Rails: `Float::INFINITY` / `-Float::INFINITY` are the canonical
 * sentinels for PG date/datetime infinity. Using `Number.POSITIVE_INFINITY`
 * / `Number.NEGATIVE_INFINITY` so `record.date == Float::INFINITY` parity holds
 * — `record.date === Infinity` for both string-typed ("infinity") and
 * numeric-typed (`Float::INFINITY`) user input.
 *
 * The branded type narrows the public sentinel constants while still
 * permitting plain numeric Infinity to satisfy `value === DateInfinity`
 * comparisons throughout the date/datetime type chain.
 */

declare const dateInfinityBrand: unique symbol;
declare const dateNegativeInfinityBrand: unique symbol;

export type DateInfinity = number & { readonly [dateInfinityBrand]: "DateInfinity" };
export type DateNegativeInfinity = number & {
  readonly [dateNegativeInfinityBrand]: "DateNegativeInfinity";
};

export const DateInfinity: DateInfinity = Number.POSITIVE_INFINITY as DateInfinity;

export const DateNegativeInfinity: DateNegativeInfinity =
  Number.NEGATIVE_INFINITY as DateNegativeInfinity;

export function isDateInfinity(v: unknown): v is DateInfinity {
  return v === DateInfinity;
}

export function isDateNegativeInfinity(v: unknown): v is DateNegativeInfinity {
  return v === DateNegativeInfinity;
}
