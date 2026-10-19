import { Module } from "@blazetrails/ruby-compat";
import * as DomAssertions from "./dom-assertions.js";
import * as SelectorAssertions from "./selector-assertions.js";

export const Assertions = new Module((mod) => {
  mod.include(DomAssertions);
  mod.include(SelectorAssertions);
});
