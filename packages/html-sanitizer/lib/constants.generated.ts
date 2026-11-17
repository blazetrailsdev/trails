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
  [() => m4.HTML4FullSanitizer, "Trails::HTML4::FullSanitizer"],
  [() => m4.HTML4LinkSanitizer, "Trails::HTML4::LinkSanitizer"],
  [() => m4.HTML4SafeListSanitizer, "Trails::HTML4::SafeListSanitizer"],
  [() => m4.HTML5FullSanitizer, "Trails::HTML5::FullSanitizer"],
  [() => m4.HTML5LinkSanitizer, "Trails::HTML5::LinkSanitizer"],
  [() => m4.HTML5SafeListSanitizer, "Trails::HTML5::SafeListSanitizer"],
]);
