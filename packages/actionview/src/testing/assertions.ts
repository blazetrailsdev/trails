import { Module } from "@blazetrails/ruby-compat";
import { DomAssertions } from "./dom-assertions.js";

export type Assertions = DomAssertions;

export const Assertions = new Module((mod) => {
  mod.include(DomAssertions);
});
