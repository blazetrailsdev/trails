import { expect } from "vitest";

import { Tokenizer as CT, type Node, type TokenizerOptions } from "../../../lib/crass/tokenizer.js";

export function assertTokens(
  input: string,
  actual: unknown,
  offset = 0,
  options: TokenizerOptions = {},
): void {
  if (!Array.isArray(actual)) actual = [actual];
  const tokens = tokenize(input, offset, options);

  expect(actual).toEqual(tokens);
}

export function repositionTokens(tokens: Node[], offset: number): Node[] {
  tokens.forEach((token) => {
    (token as { pos: number }).pos += offset;
  });
  return tokens;
}

export function tokenize(input: string, offset = 0, options: TokenizerOptions = {}): Node[] {
  const tokens = CT.tokenize(input, options);
  if (offset !== 0) repositionTokens(tokens, offset);
  return tokens;
}
