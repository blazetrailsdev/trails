import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./fragment.js";
import * as m1 from "./gem-version.js";
import * as m2 from "./html-conversion.js";
import * as m3 from "./plain-text-conversion.js";

defineConstants([
  [() => m0.Fragment, "ActionText::Fragment"],
  [() => m2.HtmlConversion, "ActionText::HtmlConversion"],
  [() => m3.PlainTextConversion, "ActionText::PlainTextConversion"],
  [() => m1.VERSION, "ActionText::VERSION"],
]);
