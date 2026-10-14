// `@blazetrails/ruby-compat/psych-adapter` uses top-level await — incompatible with Rollup IIFE format.
import * as yaml from "yaml";

export { yaml };
export { parse, stringify } from "yaml";
export type { CollectionTag, YAMLMap } from "yaml";
