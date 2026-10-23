import { include } from "@blazetrails/ruby-compat";
import * as DomAssertions from "./dom-assertions.js";
import * as SelectorAssertions from "./selector-assertions.js";

export const Assertions = {};
include(Assertions, DomAssertions);
include(Assertions, SelectorAssertions);
