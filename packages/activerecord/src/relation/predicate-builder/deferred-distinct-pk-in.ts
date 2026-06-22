import { Nodes } from "@blazetrails/arel";

/**
 * Deferred distinct-PK `IN`/`NOT IN` markers.
 *
 * Mirrors the materialization Rails performs inside
 * `PredicateBuilder::RelationHandler#call` → `apply_join_dependency`, which —
 * for an eager-loading subquery that also has a limit/offset over a collection
 * reflection — calls `connection.distinct_relation_for_primary_key` and EXECUTES
 * a `SELECT DISTINCT <pk> … LIMIT …` to materialize a literal id list, rewriting
 * the relation to `WHERE pk IN (ids)`. MySQL forbids `LIMIT` inside an `IN (...)`
 * subquery, so materializing is mandatory for parity.
 *
 * trails' `.where()` is synchronous and lazy, so it cannot run that query where
 * Rails does. Instead `RelationHandler#call` records one of these markers in the
 * outer relation's where clause carrying the inner relation, and the relation
 * load pipeline (`_materializeDeferredDistinctPkPredicates`) awaits the
 * materialization just before compile, substituting `attribute.in([...ids])`.
 *
 * Each marker subclasses the plain `In`/`NotIn` it would become, so the visitor
 * dispatches it through the same method (prototype-chain fallback) and the
 * synchronous `toSql()` path still renders the inline DISTINCT-LIMIT subquery
 * (`right`) for SQLite/PostgreSQL display.
 */
export class DeferredDistinctPkIn extends Nodes.In {
  constructor(
    attribute: Nodes.Attribute,
    inlineSubquery: Nodes.Node,
    readonly innerRelation: { _materializeDistinctPkIds(): Promise<unknown[]> },
  ) {
    super(attribute, inlineSubquery);
  }
}

export class DeferredDistinctPkNotIn extends Nodes.NotIn {
  constructor(
    attribute: Nodes.Attribute,
    inlineSubquery: Nodes.Node,
    readonly innerRelation: { _materializeDistinctPkIds(): Promise<unknown[]> },
  ) {
    super(attribute, inlineSubquery);
  }
}
