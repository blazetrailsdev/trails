import { extend, rbModAppendFeatures } from "@blazetrails/ruby-compat";
import { ClassMethods as Format2ClassMethods } from "../format2/timezone-definition.js";
import { TimezoneDefiner } from "./timezone-definer.js";

/** @internal */
export const ClassMethods = {
  /** @internal */
  timezoneDefinerClass(): typeof TimezoneDefiner {
    return TimezoneDefiner;
  },
};

/** @internal */
export const TimezoneDefinition = { ClassMethods };
Object.defineProperty(TimezoneDefinition, "appendFeatures", {
  value(this: typeof TimezoneDefinition, base: object): void {
    rbModAppendFeatures(base, this);
    extend(base, Format2ClassMethods);
    extend(base, ClassMethods);
  },
});
