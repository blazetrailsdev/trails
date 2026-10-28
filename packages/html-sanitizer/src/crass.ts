import { Parser } from "./crass/parser.js";
import type { Node, TokenizerOptions } from "./crass/tokenizer.js";

export { Parser } from "./crass/parser.js";
export type { Node, TokenizerOptions } from "./crass/tokenizer.js";

export const Crass = {
  parseProperties(input: string, options: TokenizerOptions = {}): Node[] {
    return Parser.parseProperties(input, options);
  },
  Parser,
};
