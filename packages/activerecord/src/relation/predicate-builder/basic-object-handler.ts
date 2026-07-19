import { Nodes } from "@blazetrails/arel";
import { attributeRelationOf } from "./attribute-relation.js";

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
    buildBindAttribute(columnName: string, value: unknown, relation?: unknown): unknown;
  };

  constructor(predicateBuilder: {
    buildBindAttribute(columnName: string, value: unknown, relation?: unknown): unknown;
  }) {
    this._predicateBuilder = predicateBuilder;
  }

  call(attribute: Nodes.Attribute, value: unknown): Nodes.Node {
    // Pass the attribute's own relation so a joined/aliased column resolves
    // through the full type cascade — Rails gets this for free because it
    // re-roots `table` per association before building the bind.
    const bind = this._predicateBuilder.buildBindAttribute(
      attribute.name,
      value,
      attributeRelationOf(attribute),
    );
    return attribute.eq(bind);
  }

  private get predicateBuilder() {
    return this._predicateBuilder;
  }
}
