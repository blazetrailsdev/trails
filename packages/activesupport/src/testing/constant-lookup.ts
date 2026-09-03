import { safeConstantize } from "../inflector.js";

export namespace ConstantLookup {
  export function determineConstantFromTestName(
    testName: string,
    block: (constant: unknown) => boolean,
  ): unknown {
    const names = testName.split("::");
    while (names.length > 0) {
      names[names.length - 1] = names[names.length - 1].replace(/Test$/, "");
      try {
        const constant = safeConstantize(names.join("::"));
        if (block(constant)) return constant;
      } finally {
        names.pop();
      }
    }
    return undefined;
  }
}
