import type { Test } from "./assertions.js";

export function afterTeardown(this: Test, super_: () => unknown): unknown {
  const result = super_();
  if (result instanceof Promise)
    return result.then(() => afterTeardown.call(this, () => undefined));

  if (this.assertions === 0 && !this.isSkipped() && !this.isError()) {
    const [file, line] = this.sourceLocation;
    warn(`Test is missing assertions: \`${this.name}\` ${file}:${line}`);
  }
}

/** @noRailsEquivalent PERMANENT */
function warn(message: string): void {
  console.warn(message);
}
