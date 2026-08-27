import { Nodes } from "@blazetrails/arel";
import { toS } from "@blazetrails/activesupport";

export class BasicObjectHandler {
  private _predicateBuilder: {
    buildBindAttribute(columnName: string, value: unknown): unknown;
  };

  constructor(predicateBuilder: {
    buildBindAttribute(columnName: string, value: unknown): unknown;
  }) {
    this._predicateBuilder = predicateBuilder;
  }

  call(attribute: Nodes.Attribute, value: unknown): Nodes.Node {
    const bind = this._predicateBuilder.buildBindAttribute(toS(attribute.name), value);
    return attribute.eq(bind);
  }

  private get predicateBuilder() {
    return this._predicateBuilder;
  }
}
