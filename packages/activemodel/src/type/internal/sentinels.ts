declare const dateInfinityBrand: unique symbol;
declare const dateNegativeInfinityBrand: unique symbol;

export type DateInfinity = number & { readonly [dateInfinityBrand]: "DateInfinity" };
export type DateNegativeInfinity = number & {
  readonly [dateNegativeInfinityBrand]: "DateNegativeInfinity";
};

export const DateInfinity: DateInfinity = Number.POSITIVE_INFINITY as DateInfinity;

export const DateNegativeInfinity: DateNegativeInfinity =
  Number.NEGATIVE_INFINITY as DateNegativeInfinity;
