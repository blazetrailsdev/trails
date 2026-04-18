import { Nodes } from "@blazetrails/arel";

/**
 * Handles basic scalar values (strings, numbers, booleans) in where
 * conditions by building simple equality predicates via bind attributes.
 *
 * Mirrors: ActiveRecord::PredicateBuilder::BasicObjectHandler
 *
 * In Rails, this wraps the value in a QueryAttribute via
 * predicateBuilder.buildBindAttribute, then passes the bind
 * object to attribute.eq. This produces BindParam nodes in the
 * Arel tree for proper bind parameter extraction.
 */
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
    const bind = this._predicateBuilder.buildBindAttribute(attribute.name, value);
    return attribute.eq(bind);
  }
}
