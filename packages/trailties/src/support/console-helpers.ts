import { expect } from "vitest";
import type { StringIO } from "@blazetrails/ruby-compat";

export function assertOutput(expected: string, io: StringIO, timeout: number = 10): void {
  const deadline = Date.now() + timeout * 1000;

  const decoder = new TextDecoder();
  let output = "";
  while (!output.includes(expected) && Date.now() <= deadline) {
    const char = io.read(1);
    if (char === null) break;
    output += decoder.decode(char, { stream: true });
  }

  expect(output, `${JSON.stringify(expected)} expected, but got:\n\n${output}`).toContain(expected);
}
