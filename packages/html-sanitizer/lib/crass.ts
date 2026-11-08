import { TopLevel, constSet } from "@blazetrails/ruby-compat";

import { Parser } from "./crass/parser.js";
import { Scanner } from "./crass/scanner.js";
import { TokenScanner } from "./crass/token-scanner.js";
import { Tokenizer } from "./crass/tokenizer.js";
import type { Node, TokenizerOptions } from "./crass/tokenizer.js";
import "./constants.generated.js";

export { Parser } from "./crass/parser.js";
export type { Node, TokenizerOptions } from "./crass/tokenizer.js";

export const Crass = {
  parseProperties(input: string, options: TokenizerOptions = {}): Node[] {
    return Parser.parseProperties(input, options);
  },
  Parser,
};
constSet(TopLevel, "Crass", Crass);
constSet(Crass, "Scanner", Scanner);
constSet(Crass, "TokenScanner", TokenScanner);
constSet(Crass, "Tokenizer", Tokenizer);
