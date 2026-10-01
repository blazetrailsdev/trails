import { Nodes } from "../namespaces.js";
import { rbSetClassPathString } from "@blazetrails/ruby-compat";
import { Binary } from "./binary.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Filter extends Binary {}

type _WindowPredications = import("../window-predications.js").WindowPredicationsModule;

/* eslint-disable-next-line @typescript-eslint/no-empty-object-type,
   @typescript-eslint/no-unsafe-declaration-merging */
export interface Filter extends _WindowPredications {}

rbSetClassPathString(Filter, Nodes, "Filter");
Nodes.Filter = Filter;
