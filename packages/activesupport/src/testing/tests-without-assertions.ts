import { rbCallSuper, rbObjMethod } from "@blazetrails/ruby-compat";
import type { Test } from "./assertions.js";

export function afterTeardown(this: Test): unknown {
  const result = rbCallSuper(this, afterTeardown);
  const check = (): void => {
    if (this.assertions === 0 && !this.isSkipped() && !this.isError()) {
      const [file, line] = rbObjMethod(this, this.name).sourceLocation() ?? [];
      warn(`Test is missing assertions: \`${this.name}\` ${file}:${line}`);
    }
  };
  return result instanceof Promise ? result.then(check) : check();
}

/** @noRailsEquivalent PERMANENT */
function warn(message: string): void {
  console.warn(message);
}
