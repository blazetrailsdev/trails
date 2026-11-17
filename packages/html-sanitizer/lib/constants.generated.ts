import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./crass.js";
import * as m1 from "./crass/parser.js";
import * as m2 from "./crass/scanner.js";
import * as m3 from "./crass/token-scanner.js";
import * as m4 from "./crass/tokenizer.js";
import * as m5 from "./rails-html-sanitizer.js";
import * as m6 from "./sanitizer.js";

defineConstants([
  [() => m0.Crass, "Crass"],
  [() => m1.Parser, "Crass::Parser"],
  [() => m2.Scanner, "Crass::Scanner"],
  [() => m4.Tokenizer, "Crass::Tokenizer"],
  [() => m3.TokenScanner, "Crass::TokenScanner"],
  [() => m5.ActionView, "RailsHtmlSanitizer::ActionView"],
  [() => m6.Sanitizer, "Trails::HTML::Sanitizer"],
  [() => m6.HTML4FullSanitizer, "Trails::HTML4::FullSanitizer"],
  [() => m6.HTML4LinkSanitizer, "Trails::HTML4::LinkSanitizer"],
  [() => m6.HTML4SafeListSanitizer, "Trails::HTML4::SafeListSanitizer"],
  [() => m6.HTML5FullSanitizer, "Trails::HTML5::FullSanitizer"],
  [() => m6.HTML5LinkSanitizer, "Trails::HTML5::LinkSanitizer"],
  [() => m6.HTML5SafeListSanitizer, "Trails::HTML5::SafeListSanitizer"],
]);
