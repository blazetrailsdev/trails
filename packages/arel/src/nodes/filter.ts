import { Node } from "./node.js";
import { Binary } from "./binary.js";

/**
 * Filter — FILTER (WHERE ...) clause for aggregate functions.
 *
 * Mirrors: Arel::Nodes::Filter (extends Binary), which includes
 * Arel::WindowPredications (filter.rb:6). Runtime mixin wiring lives in
 * ../index.ts.
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Filter extends Binary {
  constructor(left: Node, right: Node) {
    super(left, right);
  }
}

type _WindowPredications = import("../window-predications.js").WindowPredicationsModule;

/* eslint-disable-next-line @typescript-eslint/no-empty-object-type,
   @typescript-eslint/no-unsafe-declaration-merging */
export interface Filter extends _WindowPredications {}
