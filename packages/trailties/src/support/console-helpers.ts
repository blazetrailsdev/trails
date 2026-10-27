import { expect } from "vitest";
import type { StringIO } from "@blazetrails/ruby-compat";

export function assertOutput(expected: string, io: StringIO, timeout: number = 10): void {
  const deadline = Date.now() + timeout * 1000;

  let output = "";
  while (!output.includes(expected) && Date.now() <= deadline) {
    const char = io.read(1);
    if (char === null) break;
    output += new TextDecoder().decode(char);
  }

  expect(output, `${JSON.stringify(expected)} expected, but got:\n\n${output}`).toContain(expected);
}
