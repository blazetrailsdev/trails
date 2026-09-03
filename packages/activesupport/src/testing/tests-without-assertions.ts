import type { Assertion, UnexpectedError } from "./assertions.js";

/** @noRailsEquivalent PERMANENT */
export interface RunningTest {
  assertions: number;
  skipped: boolean;
  error: boolean;
  name: string;
  sourceLocation: [string, number];
  failures: (Assertion | UnexpectedError)[];
}

export function afterTeardown(test: RunningTest): void {
  if (test.assertions === 0 && !test.skipped && !test.error) {
    const [file, line] = test.sourceLocation;
    warn(`Test is missing assertions: \`${test.name}\` ${file}:${line}`);
  }
}

/** @noRailsEquivalent PERMANENT */
function warn(message: string): void {
  console.warn(message);
}
