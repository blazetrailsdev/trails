import { Nodes } from "@blazetrails/arel";
import type { Range } from "../../connection-adapters/postgresql/oid/range.js";
import type { PredicateBuilder } from "../predicate-builder.js";
import { toS } from "@blazetrails/activesupport";

export class RangeHandler {
  private _predicateBuilder: PredicateBuilder;

  constructor(predicateBuilder: PredicateBuilder) {
    this._predicateBuilder = predicateBuilder;
  }

  /** @missingRailsCall new — PERMANENT */
  call(attribute: Nodes.Attribute, value: Range): Nodes.Node {
    const beginBind = this.predicateBuilder.buildBindAttribute(toS(attribute.name), value.begin);
    const endBind = this.predicateBuilder.buildBindAttribute(toS(attribute.name), value.end);
    return attribute.between({ begin: beginBind, end: endBind, excludeEnd: value.excludeEnd });
  }

  private get predicateBuilder(): PredicateBuilder {
    return this._predicateBuilder;
  }
}
