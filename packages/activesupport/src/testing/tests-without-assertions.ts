import type { Test } from "./assertions.js";

export function afterTeardown(this: Test, super_: () => unknown): unknown {
  const warnWithoutAssertions = (): void => {
    if (this.assertions === 0 && !this.isSkipped() && !this.isError()) {
      const [file, line] = this.sourceLocation;
      warn(`Test is missing assertions: \`${this.name}\` ${file}:${line}`);
    }
  };
  const result = super_();
  return result instanceof Promise ? result.then(warnWithoutAssertions) : warnWithoutAssertions();
}

/** @noRailsEquivalent PERMANENT */
function warn(message: string): void {
  console.warn(message);
}
