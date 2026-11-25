import { BigDecimal } from "@blazetrails/ruby-compat/big-decimal";
import { prepend, rbCallSuper } from "@blazetrails/ruby-compat/include";

/** @internal */
export const BigDecimalWithDefaultFormat = {
  toString(this: BigDecimal, format = "F"): string {
    return rbCallSuper(this, BigDecimalWithDefaultFormat.toString, format) as string;
  },
};

prepend(BigDecimal, BigDecimalWithDefaultFormat);

export { BigDecimal, toD } from "@blazetrails/ruby-compat/big-decimal";
