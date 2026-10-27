import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./did-you-mean.js";
import * as m1 from "./formatter.js";
import * as m2 from "./jaro-winkler.js";
import * as m3 from "./levenshtein.js";
import * as m4 from "./spell-checker.js";
import * as m5 from "./spell-checkers/null-checker.js";

registerClassPaths([
  [() => m0.DeprecatedMapping, "DidYouMean::DeprecatedMapping"],
  [() => m1.Formatter, "DidYouMean::Formatter"],
  [() => m2.Jaro, "DidYouMean::Jaro"],
  [() => m2.JaroWinkler, "DidYouMean::JaroWinkler"],
  [() => m3.Levenshtein, "DidYouMean::Levenshtein"],
  [() => m5.NullChecker, "DidYouMean::NullChecker"],
  [() => m4.SpellChecker, "DidYouMean::SpellChecker"],
]);
