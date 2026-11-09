import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./crass/parser.js";
import * as m1 from "./crass/scanner.js";
import * as m2 from "./crass/token-scanner.js";
import * as m3 from "./crass/tokenizer.js";
import * as m4 from "./sanitizer.js";

defineConstants([
  [() => m0.Parser, "Crass::Parser"],
  [() => m1.Scanner, "Crass::Scanner"],
  [() => m3.Tokenizer, "Crass::Tokenizer"],
  [() => m2.TokenScanner, "Crass::TokenScanner"],
  [() => m4.Sanitizer, "Trails::HTML::Sanitizer"],
]);
