import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./did-you-mean.js";
import * as m1 from "./formatter.js";
import * as m2 from "./spell-checker.js";
import * as m3 from "./spell-checkers/null-checker.js";

registerClassPaths([
  [() => m0.DeprecatedMapping, "DidYouMean::DeprecatedMapping"],
  [() => m1.Formatter, "DidYouMean::Formatter"],
  [() => m3.NullChecker, "DidYouMean::NullChecker"],
  [() => m2.SpellChecker, "DidYouMean::SpellChecker"],
]);
