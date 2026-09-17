import type { Module } from "@blazetrails/ruby-compat";
import { concern as moduleConcern } from "../module/concerning.js";

export function concern(
  topic: string,
  moduleDefinition: (this: Module, mod: Module) => void,
): Module {
  return moduleConcern.call(Object, topic, moduleDefinition);
}
