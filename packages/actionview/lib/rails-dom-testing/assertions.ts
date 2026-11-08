import { include } from "@blazetrails/ruby-compat";
import * as DomAssertions from "./assertions/dom-assertions.js";
import * as SelectorAssertions from "./assertions/selector-assertions.js";

export const Assertions = {};
include(Assertions, DomAssertions);
include(Assertions, SelectorAssertions);
