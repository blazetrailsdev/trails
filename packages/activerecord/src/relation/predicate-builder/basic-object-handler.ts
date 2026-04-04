import { Nodes } from "@blazetrails/arel";

/**
 * Handles basic scalar values (strings, numbers, booleans) in where
 * conditions by building simple equality predicates.
 *
 * Mirrors: ActiveRecord::PredicateBuilder::BasicObjectHandler
 *
 * Examples:
 *   where({ name: "dean" })  → name = 'dean'
 *   where({ age: 30 })       → age = 30
 *   where({ active: true })  → active = true
 */
export class BasicObjectHandler {
  constructor() {}

  call(attribute: Nodes.Attribute, value: unknown): Nodes.Node {
    return attribute.eq(value);
  }
}
