import { defineConstants } from "@blazetrails/ruby-compat/classpath";
import * as m0 from "./core-ext/name-error.js";
import * as m1 from "./did-you-mean.js";
import * as m2 from "./formatter.js";
import * as m3 from "./jaro-winkler.js";
import * as m4 from "./levenshtein.js";
import * as m5 from "./spell-checker.js";
import * as m6 from "./spell-checkers/name-error-checkers/class-name-checker.js";
import * as m7 from "./spell-checkers/null-checker.js";

defineConstants([
  [() => m6, "ClassNameChecker", "DidYouMean::ClassNameChecker"],
  [() => m0, "Correctable", "DidYouMean::Correctable"],
  [() => m1, "DeprecatedMapping", "DidYouMean::DeprecatedMapping"],
  [() => m2, "Formatter", "DidYouMean::Formatter"],
  [() => m3, "Jaro", "DidYouMean::Jaro"],
  [() => m3, "JaroWinkler", "DidYouMean::JaroWinkler"],
  [() => m4, "Levenshtein", "DidYouMean::Levenshtein"],
  [() => m7, "NullChecker", "DidYouMean::NullChecker"],
  [() => m5, "SpellChecker", "DidYouMean::SpellChecker"],
]);
