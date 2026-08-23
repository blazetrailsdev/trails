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

  invert(): DeferredDistinctPkNotIn {
    return new DeferredDistinctPkNotIn(
      this.left as Nodes.Attribute,
      this.right as Nodes.Node,
      this.innerRelation,
    );
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

  invert(): DeferredDistinctPkIn {
    return new DeferredDistinctPkIn(
      this.left as Nodes.Attribute,
      this.right as Nodes.Node,
      this.innerRelation,
    );
  }
}

/**
 * Deferred id-materialization marker for the unloaded Relation argument(s) to
 * `excluding`/`without`.
 *
 * Mirrors Rails `QueryMethods#excluding` (query_methods.rb:1583-1588), which
 * builds a SINGLE predicate over the concatenated
 * `records + relations.flat_map(&:ids)` array:
 * `predicate_builder[primary_key, records].invert`. `relations.flat_map(&:ids)`
 * runs a separate `SELECT <pk>` query per relation, producing a literal id
 * array — except for a `loaded?` relation, whose `ids` runs no query
 * (calculations.rb:373-380) and which `excluding` therefore flattens eagerly,
 * where Rails flattens. trails' query builder is synchronous and cannot run the
 * id-select at `.excluding()`-build time, so the relations that DO need one — an
 * un-loaded relation, or a `scheduled?` one whose parked rows must be drained —
 * are recorded in one marker carrying both the already-known `literalIds`
 * (scalar/loaded record ids) and those `innerRelations`. The load pipeline (`_materializeDeferredDistinctPkPredicates`)
 * awaits every `innerRelations[i].ids()`, concatenates them after `literalIds`,
 * and substitutes a single literal `attribute.notIn([...ids])` before compile —
 * preserving Rails' one-predicate shape, not an `AND` of separate `NOT IN`s.
 *
 * Subclasses `NotIn` (carrying a pk-select subquery as the inline `right`) so the
 * synchronous `toSql()` path — used only when SQL is requested without loading —
 * still renders `id NOT IN (SELECT <pk> FROM ...)` as a best-effort display
 * fallback before materialization.
 */
export class DeferredIdsNotIn extends Nodes.NotIn {
  constructor(
    attribute: Nodes.Attribute,
    inlineSubquery: Nodes.Node,
    readonly literalIds: unknown[],
    readonly innerRelations: { ids(): Promise<unknown[]> }[],
  ) {
    super(attribute, inlineSubquery);
  }

  invert(): DeferredIdsIn {
    return new DeferredIdsIn(
      this.left as Nodes.Attribute,
      this.right as Nodes.Node,
      this.literalIds,
      this.innerRelations,
    );
  }
}

/**
 * Positive counterpart produced only by `DeferredIdsNotIn#invert` — no builder
 * records it directly. Carries the same deferred payload so the load pipeline
 * materializes it to a literal `attribute.in([...ids])`.
 */
export class DeferredIdsIn extends Nodes.In {
  constructor(
    attribute: Nodes.Attribute,
    inlineSubquery: Nodes.Node,
    readonly literalIds: unknown[],
    readonly innerRelations: { ids(): Promise<unknown[]> }[],
  ) {
    super(attribute, inlineSubquery);
  }

  invert(): DeferredIdsNotIn {
    return new DeferredIdsNotIn(
      this.left as Nodes.Attribute,
      this.right as Nodes.Node,
      this.literalIds,
      this.innerRelations,
    );
  }
}
