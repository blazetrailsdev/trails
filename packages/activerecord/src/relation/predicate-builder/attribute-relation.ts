import { Nodes } from "@blazetrails/arel";

/**
 * The typeCaster-bearing relation an Arel attribute was resolved against.
 *
 * Lives in its own module so both `PredicateBuilder` and the handlers it
 * constructs can reach for the relation the same way without an import cycle.
 * It is the trails stand-in for Rails re-rooting `PredicateBuilder#table` per
 * association: a joined/aliased column's type caster hangs off the attribute's
 * relation, not off the builder's own table.
 */
export function attributeRelationOf(attribute: Nodes.Attribute): unknown {
  return (attribute as unknown as { relation?: unknown }).relation;
}
