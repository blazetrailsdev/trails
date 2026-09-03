import { Nodes } from "@blazetrails/arel";

import type { PredicateBuilder } from "../predicate-builder.js";
import { Range } from "@blazetrails/activesupport";
import { rbObjAsString as toS } from "@blazetrails/ruby-compat";

export class RangeHandler {
  private _predicateBuilder: PredicateBuilder;

  constructor(predicateBuilder: PredicateBuilder) {
    this._predicateBuilder = predicateBuilder;
  }

  /** @missingRailsCall new — PERMANENT */
  call(attribute: Nodes.Attribute, value: Range<unknown>): Nodes.Node {
    const beginBind = this.predicateBuilder.buildBindAttribute(toS(attribute.name), value.begin);
    const endBind = this.predicateBuilder.buildBindAttribute(toS(attribute.name), value.end);
    return attribute.between({ begin: beginBind, end: endBind, excludeEnd: value.excludeEnd });
  }

  private get predicateBuilder(): PredicateBuilder {
    return this._predicateBuilder;
  }
}
