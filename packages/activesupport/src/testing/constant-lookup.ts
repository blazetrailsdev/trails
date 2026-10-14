import { extend, Module } from "@blazetrails/ruby-compat";
import { Concern } from "../concern.js";
import { safeConstantize } from "../inflector.js";

export const ClassMethods = {
  determineConstantFromTestName(testName: string, block: (constant: unknown) => unknown): unknown {
    const names = testName.split("::");
    while (names.length > 0) {
      names[names.length - 1] = names[names.length - 1].replace(/Test$/, "");
      try {
        const constant = safeConstantize(names.join("::"));
        const yielded = block(constant);
        if (yielded != null && yielded !== false) return constant;
      } finally {
        names.pop();
      }
    }
    return null;
  },
};

export const ConstantLookup = new Module((mod) => {
  extend(mod, Concern);

  (mod as unknown as { ClassMethods: typeof ClassMethods }).ClassMethods = ClassMethods;
});
