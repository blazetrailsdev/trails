import { Nodes } from "@blazetrails/arel";
import type { Range } from "../../connection-adapters/postgresql/oid/range.js";
import type { PredicateBuilder } from "../predicate-builder.js";
import { toS } from "@blazetrails/activesupport";

/**
 * Handles Range values in where conditions by delegating to
 * `attribute.between`, which encodes Rails' Arel `Predications#between`
 * decision tree (open-ended, ±Infinity, exclude-end).
 *
 * Mirrors: ActiveRecord::PredicateBuilder::RangeHandler (range_handler.rb).
 * Rails' `RangeWithBinds` struct is an object literal here: `between` reads
 * `begin` / `end` / `excludeEnd` off it and nothing else.
 */
export class RangeHandler {
  private _predicateBuilder: PredicateBuilder;

  constructor(predicateBuilder: PredicateBuilder) {
    this._predicateBuilder = predicateBuilder;
  }

  /**
   * @missingRailsCall new — PERMANENT: `RangeWithBinds.new(begin_bind, end_bind, exclude_end?)`
   * (range_handler.rb:6, 15). The Struct exists in Ruby because `between` needs a
   * Range-shaped object and a real Range would re-coerce its bounds; a TS object
   * literal is that shape, and `between` reads nothing else off it.
   */
  call(attribute: Nodes.Attribute, value: Range): Nodes.Node {
    const beginBind = this.predicateBuilder.buildBindAttribute(toS(attribute.name), value.begin);
    const endBind = this.predicateBuilder.buildBindAttribute(toS(attribute.name), value.end);
    return attribute.between({ begin: beginBind, end: endBind, excludeEnd: value.excludeEnd });
  }

  private get predicateBuilder(): PredicateBuilder {
    return this._predicateBuilder;
  }
}
