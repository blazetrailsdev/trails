import type { Test } from "./assertions.js";

export function afterTeardown(this: Test, super_: () => unknown): unknown {
  const result = super_();
  const check = (): void => {
    if (this.assertions === 0 && !this.isSkipped() && !this.isError()) {
      const [file, line] = this.sourceLocation;
      warn(`Test is missing assertions: \`${this.name}\` ${file}:${line}`);
    }
  };
  return result instanceof Promise ? result.then(check) : check();
}

/** @noRailsEquivalent PERMANENT */
function warn(message: string): void {
  console.warn(message);
}
