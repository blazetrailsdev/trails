import { BigDecimal, prepend, type PrependMethod } from "@blazetrails/ruby-compat";

/** @internal */
export const BigDecimalWithDefaultFormat = {
  toString: function (super_: (format: string) => string, format = "F"): string {
    return super_(format);
  } as PrependMethod,
};

prepend(BigDecimal.prototype, BigDecimalWithDefaultFormat);

export { BigDecimal, toD } from "@blazetrails/ruby-compat";
