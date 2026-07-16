import { Table, Nodes, sql as arelSql } from "@blazetrails/arel";
import { Range } from "../connection-adapters/postgresql/oid/range.js";
import { QueryAttribute } from "./query-attribute.js";
import { ArrayHandler } from "./predicate-builder/array-handler.js";
import { isBaseInstance } from "./predicate-builder/is-base-instance.js";
import { RangeHandler, UnboundableBound } from "./predicate-builder/range-handler.js";
import { BasicObjectHandler } from "./predicate-builder/basic-object-handler.js";
import { RelationHandler } from "./predicate-builder/relation-handler.js";
import { AssociationQueryValue } from "./predicate-builder/association-query-value.js";
import { Substitute } from "../statement-cache.js";
import { PolymorphicArrayValue } from "./predicate-builder/polymorphic-array-value.js";
import { argumentError } from "./query-methods.js";
import { Connection as TypeCasterConnection } from "../type-caster/connection.js";

interface BoundType {
  cast?(x: unknown): unknown;
  serialize?(x: unknown): unknown;
}

/**
 * Converts hash conditions ({ name: "dean", age: 30 }) into
 * Arel predicate nodes. Used by Relation to build WHERE clauses.
 *
 * Mirrors: ActiveRecord::PredicateBuilder
 */
export class PredicateBuilder {
  private _table: Table;

  /** @internal */
  get table(): Table {
    return this._table;
  }

  protected set table(value: Table) {
    this._table = value;
  }
  private arrayHandler: ArrayHandler;
  private rangeHandler: RangeHandler;
  private basicObjectHandler: BasicObjectHandler;
  private relationHandler: RelationHandler;
  private handlers: Array<[any, { call(attr: Nodes.Attribute, value: any): Nodes.Node }]> = [];
  private _tableContext: any = null;

  constructor(table: Table) {
    this._table = table;
    this.arrayHandler = new ArrayHandler(this);
    this.rangeHandler = new RangeHandler((attribute, v) => {
      // Resolve the type once so sign detection and the cast below agree for
      // joined/aliased attributes (see resolveBoundType).
      const type = this.resolveBoundType(attribute);
      const sentinel = this.unboundableSentinel(attribute.name, v, type);
      if (sentinel) return sentinel;
      return type?.cast ? type.cast(v) : v;
    });
    this.basicObjectHandler = new BasicObjectHandler(this);
    this.relationHandler = new RelationHandler();
  }

  /**
   * Returns an {@link UnboundableBound} sentinel when `value` is out of range
   * for `type`, else null. Both the detection and the sign come from a
   * QueryAttribute bind's `isUnboundable()` — the byte-for-byte port of Rails'
   * `serializable? { |v| @_unboundable = v <=> 0 }` (query_attribute.rb:46-50),
   * driven by the ActiveModelRangeError raised on serialize. Reusing it (rather
   * than a second sign computation) keeps this in lockstep with the
   * equality/negation single-value paths, and handles non-numeric out-of-range
   * bounds (e.g. custom types) type-agnostically.
   *
   * Callers pass the type from {@link resolveBoundType} (not the narrower
   * `this.table`-only lookup `buildBindAttribute` uses) so sign detection uses
   * the same type as the accompanying cast — otherwise a joined/aliased bound
   * could be detected against the wrong (or identity) type.
   */
  private unboundableSentinel(
    columnName: string,
    value: unknown,
    type: BoundType | undefined,
  ): UnboundableBound | null {
    const sign = this.queryAttributeWithType(columnName, value, type).isUnboundable();
    return sign === false ? null : new UnboundableBound(sign);
  }

  /**
   * Builds a QueryAttribute bind for a bound using {@link resolveBoundType}'s
   * relation/context/table cascade rather than `buildBindAttribute`'s narrower
   * `this.table`-only lookup. Used by the negation path so a joined/aliased
   * out-of-range bound is typed correctly (and thus detected as unboundable →
   * `1=1`) instead of falling through to the identity fallback and silently
   * binding a raw value the column can't hold.
   */
  private bindAttributeFor(attribute: Nodes.Attribute, value: unknown): QueryAttribute {
    return this.queryAttributeWithType(attribute.name, value, this.resolveBoundType(attribute));
  }

  private queryAttributeWithType(
    columnName: string,
    value: unknown,
    type: BoundType | undefined,
  ): QueryAttribute {
    const castType = (type ?? { cast: (v: unknown) => v, serialize: (v: unknown) => v }) as {
      cast(v: unknown): unknown;
      serialize(v: unknown): unknown;
    };
    return new QueryAttribute(columnName, value, castType);
  }

  /**
   * Resolves the column type for a range bound, preferring the attribute's own
   * relation typeCaster (covers joined/aliased tables), then the predicate
   * builder's table/model context, then the arel table. Mirrors the cascade
   * Rails' `build_bind_attribute` gets for free via `table.type(column_name)`.
   */
  private resolveBoundType(attribute: Nodes.Attribute): BoundType | undefined {
    const attrRelation = (attribute as unknown as { relation?: unknown }).relation;
    const attrType = (
      attrRelation as { typeForAttribute?(n: string): BoundType | null } | undefined
    )?.typeForAttribute?.(attribute.name);
    if (attrType) return attrType;
    const ctx = this._tableContext as {
      typeForAttribute?(n: string): BoundType | null;
    } | null;
    const ctxType = ctx?.typeForAttribute?.(attribute.name);
    if (ctxType) return ctxType;
    return this.table.typeForAttribute(attribute.name) as BoundType | undefined;
  }

  buildFromHash(
    conditions: Record<string, unknown>,
    block?: (tableName: string) => unknown,
  ): Nodes.Node[] {
    return this.buildFromHashInternal(this.convertDotNotationToHash(conditions), false, block);
  }

  buildNegatedFromHash(
    conditions: Record<string, unknown>,
    block?: (tableName: string) => unknown,
  ): Nodes.Node[] {
    return this.buildFromHashInternal(this.convertDotNotationToHash(conditions), true, block);
  }

  private buildFromHashInternal(
    conditions: Record<string, unknown>,
    negated: boolean,
    block?: (tableName: string) => unknown,
  ): Nodes.Node[] {
    // Mirrors Rails PredicateBuilder#expand_from_hash: `return ["1=0"] if
    // attributes.empty?` (predicate_builder.rb:85). An empty hash is a
    // contradiction, so `where(posts: {})` (nested empty hash) and
    // `where(sink: {})` (empty hash, no foreign key) match nothing. Top-level
    // `where({})` never reaches here — it short-circuits as a blank argument in
    // `Relation#where` (like Rails' `args.first.blank?`), so this fires only for
    // the nested/associated recursion.
    //
    // Under negation (`where.not(sink: {})`) trails threads `negated` into the
    // recursion (Rails builds positively then inverts the WhereClause), so the
    // contradiction inverts to the `1=1` tautology — `NOT (1=0)` matches every
    // row, mirroring `WhereClause#invert` over Rails' `["1=0"]`.
    if (Object.keys(conditions).length === 0) {
      return [arelSql(negated ? "1=1" : "1=0")];
    }
    const nodes: Nodes.Node[] = [];
    for (const [key, value] of Object.entries(conditions)) {
      if (
        isPlainObject(value) &&
        this._tableContext &&
        typeof this._tableContext.associatedTable === "function" &&
        !this._tableContext.hasColumn?.(key)
      ) {
        // Mirrors Rails PredicateBuilder#expand_from_hash: pass the
        // join-dependency resolver block to associatedTable so a nested-hash key
        // that is not a direct reflection (e.g. a join table name) still
        // resolves to the right klass/table instead of being used verbatim. The
        // block is NOT threaded into the recursive expansion: it resolves the
        // caller relation's join deps by table name and has no valid context
        // against the now-resolved associated table (Rails passes &block only to
        // associated_table, then calls expand_from_hash with no block).
        const assocPb: PredicateBuilder = this._tableContext.associatedTable(
          key,
          block,
        ).predicateBuilder;
        const innerNodes = negated
          ? assocPb.buildNegatedFromHash(value)
          : assocPb.buildFromHash(value);
        nodes.push(...innerNodes);
      } else if (
        !isPlainObject(value) &&
        this._tableContext &&
        typeof this._tableContext.isAssociatedWith === "function" &&
        typeof this._tableContext.associatedTable === "function" &&
        this._tableContext.isAssociatedWith(key) &&
        !this._tableContext.hasColumn?.(key)
      ) {
        const assocNodes = this.buildFromHashAssociation(
          this._tableContext.associatedTable(key),
          key,
          value,
          negated,
          conditions,
        );
        nodes.push(...assocNodes);
      } else if (
        this._tableContext &&
        typeof this._tableContext.aggregatedWith === "function" &&
        this._tableContext.aggregatedWith(key)
      ) {
        nodes.push(...this.buildFromHashAggregate(key, value, negated));
      } else {
        const attr = this.resolveColumn(key);
        nodes.push(negated ? this.buildNegated(attr, value) : this.build(attr, value));
      }
    }
    return nodes;
  }

  /**
   * Expand a `composed_of` aggregate value into predicates over its mapped
   * columns. Mirrors PredicateBuilder#expand_from_hash's `aggregated_with?`
   * branch: `where(address: Address.new(...))` becomes
   * `address_street = ? AND address_city = ? AND address_country = ?`.
   *
   * @internal
   */
  private buildFromHashAggregate(key: string, value: unknown, negated: boolean): Nodes.Node[] {
    const reflection = this._tableContext.reflectOnAggregation(key);
    const mapping: [string, string][] = reflection.mapping();
    // Rails: `values = value.nil? ? [nil] : Array.wrap(value)`.
    const values =
      value === null || value === undefined ? [null] : Array.isArray(value) ? value : [value];
    if (mapping.length === 1 || values.length === 0) {
      const [columnName, aggregateAttr] = mapping[0];
      // Rails: `object.respond_to?(aggr) ? object.public_send(aggr) : object`.
      const mapped = values.map((object) => extractAggregateAttr(object, aggregateAttr, false));
      return negated
        ? this.buildNegatedFromHash({ [columnName]: mapped })
        : this.buildFromHash({ [columnName]: mapped });
    }
    // Multi-mapping: one AND-group per object over every mapped column, ORed
    // together (grouping_queries). Each column is built positively; negation is
    // applied once at the group level, mirroring expand_from_hash.
    const queryGroups: Nodes.Node[][] = values.map((object) =>
      mapping.map(([fieldAttr, aggregateAttr]) =>
        this.build(
          this.resolveColumn(fieldAttr),
          extractAggregateAttr(object, aggregateAttr, true),
        ),
      ),
    );
    return this.groupingQueries(queryGroups, negated);
  }

  /** @internal */
  private buildFromHashAssociation(
    associatedTable: any,
    key: string,
    value: unknown,
    negated: boolean,
    attributes: Record<string, unknown>,
  ): Nodes.Node[] {
    if (associatedTable.isPolymorphicAssociation?.()) {
      const fk = associatedTable.joinForeignKey as string;
      const ft = associatedTable.joinForeignType as string;
      const refl = associatedTable.reflection;
      const pkFor = (klass?: unknown): string =>
        refl && typeof refl.joinPrimaryKeyFor === "function"
          ? String(refl.joinPrimaryKeyFor(klass))
          : String(associatedTable.joinPrimaryKey ?? "id");
      const values = Array.isArray(value) ? value : [value];
      const queries = new PolymorphicArrayValue(
        { joinForeignKey: fk, joinForeignType: ft, joinPrimaryKey: pkFor },
        values,
      ).queries();
      const queryGroups: Nodes.Node[][] = [];
      for (const query of queries) {
        const inner = this.buildFromHash(query);
        if (inner.length === 0) continue;
        queryGroups.push(inner);
      }
      return this.groupingQueries(queryGroups, negated);
    }
    // Through: delegate with the associated model's primary key (Rails: through_association? path).
    // Always build positively — negation is applied once at the group level below (mirrors Rails
    // expand_from_hash which never recurses with negation).
    if (associatedTable.isThroughAssociation?.()) {
      const rawPk = associatedTable.klass?.primaryKey ?? "id";
      if (Array.isArray(rawPk)) {
        throw new Error(
          "Through-association with composite primary key is not yet supported (Slot B). " +
            "Use explicit FK conditions instead.",
        );
      }
      // Normalize value through AssociationQueryValue so records are coerced to their PKs,
      // arrays of records become id lists, and Relations become subqueries — matching Rails'
      // build() which does `value = value.id if value.respond_to?(:id)` before dispatching.
      const normalizedQueries = new AssociationQueryValue(
        { joinForeignKey: rawPk, joinPrimaryKey: rawPk },
        value,
      ).queries();
      const assocPb: PredicateBuilder = associatedTable.predicateBuilder;
      const inner = normalizedQueries.flatMap((q) => assocPb.buildFromHash(q));
      if (inner.length === 0) return [];
      const group = inner.length === 1 ? inner[0] : new Nodes.And(inner);
      return negated ? [new Nodes.Not(new Nodes.Grouping(group))] : [group];
    }
    // Core non-polymorphic, non-through path.
    // Rails expand_from_hash is always positive; negation is applied once at the group level.
    const queries = new AssociationQueryValue(associatedTable, value).queries();
    const queryGroups: Nodes.Node[][] = [];
    for (const query of queries) {
      // Cycle guard: prevents infinite recursion when FK name == association name.
      if (isSameHash(query, attributes)) {
        queryGroups.push([this.build(this.resolveColumn(key), value)]);
      } else {
        const inner = this.buildFromHash(query);
        if (inner.length === 0) continue;
        queryGroups.push(inner);
      }
    }
    return this.groupingQueries(queryGroups, negated);
  }

  /**
   * Mirrors PredicateBuilder#grouping_queries: a single query group's predicates
   * are returned *flat* (so each column stays an addressable predicate, which
   * `WhereClause#extract_attributes` — and thus `rewhere` — relies on); multiple
   * groups are each AND-reduced and ORed inside a Grouping. Negation wraps the
   * group(s) in `NOT (...)` rather than negating each predicate independently.
   *
   * @internal
   */
  private groupingQueries(queryGroups: Nodes.Node[][], negated: boolean): Nodes.Node[] {
    if (queryGroups.length === 0) return [];
    if (queryGroups.length === 1) {
      const inner = queryGroups[0];
      if (!negated) return inner;
      const node = inner.length === 1 ? inner[0] : new Nodes.And(inner);
      return [new Nodes.Not(new Nodes.Grouping(node))];
    }
    // Rails `grouping_queries`: `Arel::Nodes::Or.new(queries.map!(&:reduce(:and)))`
    // — an n-ary Or over the full array, wrapped in one Grouping.
    const reduced = queryGroups.map((inner) =>
      inner.length === 1 ? inner[0] : new Nodes.And(inner),
    );
    const grouping = new Nodes.Grouping(new Nodes.Or(reduced));
    return negated ? [new Nodes.Not(grouping)] : [grouping];
  }

  buildNegated(attribute: Nodes.Attribute, value: unknown): Nodes.Node {
    // Mirror build()'s deref (predicate_builder.rb:58). In Rails the deref lives in
    // build() and negation is the inversion of a positively-built predicate, so
    // `value = value.id if value.respond_to?(:id)` always applies — `where.not(col: record)`
    // must compare against record.id, not the whole record object.
    if (respondsToId(value)) {
      value = (value as { id: unknown }).id;
    }
    if (value === null || value === undefined) {
      return attribute.notEq(null);
    }
    if (value instanceof Set) {
      value = Array.from(value);
    }
    if (value instanceof Range) {
      return this.rangeHandler.callNegated(attribute, value);
    }
    if (Array.isArray(value)) {
      return this.buildNegatedArray(attribute, value);
    }
    if (this.isRelation(value)) {
      return this.relationHandler.callNegated(attribute, value);
    }
    // Build a bind attribute (as the positive BasicObjectHandler path does)
    // rather than passing the raw value: Rails builds negation by inverting a
    // positively-built predicate, so the RHS is a QueryAttribute bind. This
    // also lets an out-of-range value report `unboundable?` at the visitor
    // (`!=` → `1=1`) instead of raising ActiveModelRangeError when bound.
    // Route through bindAttributeFor so a joined/aliased column is typed via the
    // full resolveBoundType cascade (an OOR bound typed only on this.table's
    // identity fallback would neither raise nor collapse to `1=1`).
    return attribute.notEq(this.bindAttributeFor(attribute, value));
  }

  private buildNegatedArray(attribute: Nodes.Attribute, value: unknown[]): Nodes.Node {
    if (value.length === 0) return attribute.notIn([]);

    const scalarValues: unknown[] = [];
    let hasNull = false;
    const ranges: Range[] = [];
    const nonScalarValues: unknown[] = [];

    for (const item of value) {
      if (item === null || item === undefined) {
        hasNull = true;
      } else if (item instanceof Range) {
        ranges.push(item);
      } else if (isBaseInstance(item)) {
        // Rails ArrayHandler: `x.is_a?(Base) ? x.id : x` — only genuine AR
        // records deref to their PK; a non-Base object carrying an `id` does not.
        scalarValues.push(item.id);
      } else if (typeof item === "object" || typeof item === "function") {
        nonScalarValues.push(item);
      } else {
        scalarValues.push(item);
      }
    }

    const parts: Nodes.Node[] = [];

    // Mirror Rails `ArrayHandler#call` (array_handler.rb:18-23) followed by
    // `.invert`: a length-1 value array builds the scalar predicate
    // (`build(attribute, values.first)` → Equality) and inverts to `!=`, only
    // multi-value arrays use `IN` (→ `NOT IN` here). The positive
    // `ArrayHandler.call` already collapses the single-value case via
    // `predicateBuilder.build`; mirror its inverse here with `buildNegated` so
    // both paths agree (`where.not`, `excluding`).
    if (scalarValues.length === 1) {
      parts.push(this.buildNegated(attribute, scalarValues[0]));
    } else if (scalarValues.length > 1) {
      // Mirror Rails `ArrayHandler#call` + `.invert`: the multi-value case is a
      // `HomogeneousIn` node, inverted to `:notin`. Its `castedValues` drops
      // out-of-range values, matching the positive IN path.
      parts.push(new Nodes.HomogeneousIn(scalarValues, attribute, "notin"));
    }

    if (hasNull) {
      parts.push(attribute.notEq(null));
    }

    for (const range of ranges) {
      parts.push(this.buildNegated(attribute, range));
    }

    for (const v of nonScalarValues) {
      parts.push(this.buildNegated(attribute, v));
    }

    if (parts.length === 0) return attribute.notIn([]);
    if (parts.length === 1) return parts[0];
    return new Nodes.And(parts);
  }

  build(attribute: Nodes.Attribute, value: unknown): Nodes.Node {
    // Rails predicate_builder.rb:58 — `value = value.id if value.respond_to?(:id)`,
    // the first thing build does. A bare `where(col: record)` for a scalar column
    // dereferences the record to its id before any handler dispatch. The
    // association/polymorphic hash-expansion path already coerces records via
    // AssociationQueryValue and never reaches this scalar entry point, so this does
    // not double-handle those values.
    if (respondsToId(value)) {
      value = (value as { id: unknown }).id;
    }
    // Rails applies the attribute's cast type — including any NormalizedValueType
    // decoration — to `where`/`find_by` keyword arguments. A normalizer that maps
    // a scalar to nil (e.g. `presence`) must route through the same `IS NULL`
    // path as an explicit nil so `where(col: "")` matches `where(col: nil)`. We
    // only need the normalized value to decide nil-routing here; the non-nil
    // value flows to the handler unchanged and is normalized once by the wrapped
    // bind type (so it is not normalized twice). Multi-value forms
    // (Array/Set/Range/Relation) are left untouched here: their handlers don't
    // normalize, but each element is normalized downstream when it becomes a
    // bind — `buildBindAttribute` resolves the wrapped type via `typeForAttribute`
    // (and `HomogeneousIn#castedValues` serializes through it for the IN path).
    if (this.isScalarQueryValue(value)) {
      const normalized = this.normalizeQueryValue(attribute.name, value);
      if (normalized === null || normalized === undefined) {
        return attribute.eq(null);
      }
    }
    if (value === null || value === undefined) {
      return attribute.eq(null);
    }
    // Rails checks `table.type(attribute.name).force_equality?(value)` at the top
    // of `build` — right after the `id` deref and BEFORE any handler dispatch
    // (predicate_builder.rb:57-69). So a force-equality value (PG array, PG range,
    // serialized coder object) never reaches a registered handler. Mirror that
    // precedence, and run it on the value BEFORE the Set→Array normalization
    // below: Rails routes a Set through handler_for (ArrayHandler), and
    // `OID::Array#force_equality?` is `value.is_a?(::Array)` — a Ruby Set is not
    // an Array, so a Set on an array column force-equalizes in neither Rails nor
    // here. Normalizing Set→Array first would spuriously trip force-equality.
    const forceEqNode = this._buildForceEqualityOrNull(attribute, value);
    if (forceEqNode !== null) return forceEqNode;
    // Normalize Set → Array before dispatch so every code path (custom handlers,
    // explicit Array branch, handlerFor fallback) receives an array. Rails registers
    // Set with ArrayHandler by default (predicate_builder.rb:20).
    if (value instanceof Set) {
      value = Array.from(value);
    }
    const customHandler = this.handlers.length > 0 ? this.handlerFor(value) : null;
    if (customHandler && customHandler !== this.basicObjectHandler) {
      return customHandler.call(attribute, value);
    }
    if (value instanceof Range) {
      return this.rangeHandler.call(attribute, value);
    }
    if (Array.isArray(value)) {
      return this.arrayHandler.call(attribute, value);
    }
    if (this.isRelation(value)) {
      return this.relationHandler.call(attribute, value);
    }
    return this.basicObjectHandler.call(attribute, value);
  }

  /**
   * A scalar reaches the equality/`basicObjectHandler` path where a single
   * normalized value applies. Multi-value forms (Array/Set/Range/Relation) and
   * StatementCache Substitute placeholders are excluded: their elements are
   * normalized later by the wrapped bind type, and a Substitute must stay
   * un-cast so the cached statement binds the real value at execution time.
   */
  private isScalarQueryValue(value: unknown): boolean {
    return !(
      value === null ||
      value === undefined ||
      Array.isArray(value) ||
      value instanceof Set ||
      value instanceof Range ||
      value instanceof Substitute ||
      this.isRelation(value)
    );
  }

  /**
   * Apply the attribute's normalizer (via its decorated cast type) to a scalar
   * query value, but only for attributes that declare one — so non-normalized
   * columns keep their raw query values and existing casting semantics. The
   * decorated type's `cast` casts then normalizes, mirroring Rails'
   * `type_for_attribute(name).cast(value)`.
   */
  private normalizeQueryValue(columnName: string, value: unknown): unknown {
    const klass = (this.table as { klass?: { _normalizations?: Map<string, unknown> } }).klass;
    const normalizations = klass?._normalizations;
    if (!normalizations || !normalizations.has(columnName)) return value;
    const type = this.table.typeForAttribute(columnName) as
      | { cast?(v: unknown): unknown }
      | undefined;
    return type?.cast ? type.cast(value) : value;
  }

  buildRangePredicate(attribute: Nodes.Attribute, range: Range): Nodes.Node {
    const rangeNode = this._buildForceEqualityOrNull(attribute, range);
    if (rangeNode !== null) return rangeNode;
    return this.rangeHandler.call(attribute, range);
  }

  /**
   * Build a composite-key predicate. For `cols.length > 1`:
   *
   *   (c1 = v11 AND c2 = v12) OR (c1 = v21 AND c2 = v22) OR ...
   *
   * For `cols.length === 1` (degenerate composite): a single
   * `c IN (v1, v2, ...)` predicate via `Attribute#in` — more compact
   * and often planner-friendlier than an OR chain.
   *
   * The Rails analog is `where({[col1, col2] => [[v1, v2], ...]})`,
   * which Rails routes through `Arel::Nodes::HomogeneousIn` and the
   * predicate builder. JS object keys can't be arrays, so we expose
   * the composite shape as a separate method (and a matching
   * `Relation#where(cols, tuples)` overload).
   *
   * Tuples containing `null` / `undefined` are filtered out: SQL
   * tuple-equality semantics treat any null component as a non-match
   * (Arel's `Attribute#eq(null)` would emit `IS NULL`, which is
   * different). After filtering, an empty tuple list returns `null`
   * — caller short-circuits via `Relation#none()`.
   *
   * Throws on caller bugs: empty `cols`, non-array tuple, or tuple
   * arity mismatch (silent filtering would mask real issues by
   * collapsing them into `null` → `none()`).
   *
   * Mirrors: ActiveRecord predicate-builder composite-key handling
   * (relation/predicate_builder/array_handler.rb's homogeneous-in
   * path for tuple values).
   */
  buildComposite(cols: string[], tuples: unknown[][]): Nodes.Node | null {
    if (cols.length === 0) {
      throw argumentError("PredicateBuilder.buildComposite: empty column list");
    }
    if (!Array.isArray(tuples)) {
      // Surface as ArgumentError instead of letting the for-of /
      // .filter() below throw a bare TypeError on null / object /
      // non-iterable inputs.
      throw argumentError(
        `PredicateBuilder.buildComposite: tuples must be an array, got ${tuples === null ? "null" : typeof tuples}`,
      );
    }
    // Validate shape/arity loudly — silently dropping malformed
    // tuples would turn caller bugs into `null` (→ `none()`), which
    // is hard to debug. Tagged as ArgumentError so callers can catch
    // consistently with other query-method validation throws.
    for (const t of tuples) {
      if (!Array.isArray(t)) {
        throw argumentError(
          `PredicateBuilder.buildComposite: tuple must be an array, got ${typeof t}`,
        );
      }
      if (t.length !== cols.length) {
        throw argumentError(
          `PredicateBuilder.buildComposite: tuple arity ${t.length} does not match column count ${cols.length} (cols=[${cols.join(", ")}])`,
        );
      }
    }
    // Filter null/undefined-bearing tuples (SQL tuple-equality
    // semantics — see method docstring).
    const validTuples = tuples.filter((t) => t.every((v) => v !== null && v !== undefined));
    if (validTuples.length === 0) return null;
    // Single-column degenerate case: a single `IN (...)` predicate is
    // more compact than `c=v1 OR c=v2 OR ...` and typically optimizes
    // identically (or better) on indexed columns.
    if (cols.length === 1) {
      const values = validTuples.map((t) => t[0]);
      return this.resolveColumn(cols[0]).in(values);
    }
    // Build equalities through `buildBindAttribute` so each value
    // becomes a `QueryAttribute` (= bind param) rather than an
    // `Arel::Nodes::Casted` (= inlined SQL literal). Inlined values
    // bypass `compileWithBinds` / prepared-statement caching and
    // mishandle `StatementCache::Substitute` placeholders.
    //
    // Use the resolved attribute's `.name` (not the raw `c`) when
    // constructing the bind so qualified column keys
    // (e.g. `"orders.shop_id"`) resolve to the same column-name
    // PredicateBuilder.BasicObjectHandler uses for type lookup —
    // otherwise `typeForAttribute("orders.shop_id")` returns
    // undefined and the cast falls back to identity.
    //
    // Pre-resolve `Attribute[]` once outside the per-tuple loop —
    // each `resolveColumn` allocates a fresh `Arel::Attribute` (and
    // sometimes a `Table`). Reusing the resolved attrs keeps large
    // tuple lists allocation-light.
    const attrs = cols.map((c) => this.resolveColumn(c));
    const groupings: Nodes.Node[] = validTuples.map((tuple) => {
      const eqs = attrs.map((attr, i) => attr.eq(this.buildBindAttribute(attr.name, tuple[i])));
      return new Nodes.Grouping(new Nodes.And(eqs));
    });
    if (groupings.length === 1) return groupings[0];
    // Use n-ary `Or(children[])` (Arel `Nodes::Or` extends `Nary`)
    // for a flat AST instead of the deeply-nested binary chain
    // `reduce` would produce. Keeps depth O(1) instead of O(n) for
    // large tuple lists.
    return new Nodes.Grouping(new Nodes.Or(groupings));
  }

  resolveColumn(key: string): Nodes.Attribute {
    // A `"table.column"` key resolves through `resolveArelAttribute`, so the
    // table carries a caster. Rails reaches the same place from the other side:
    // convert_dot_notation_to_hash splits on `rindex(".")`
    // (predicate_builder.rb:171) and routes the table part through
    // `associated_table` — hence lastIndexOf, matching convertDotNotationToHash
    // and references() rather than reading `a.b.c` as one column name.
    if (!key.includes('"')) {
      const dot = key.lastIndexOf(".");
      if (dot !== -1) return this.resolveArelAttribute(key.slice(0, dot), key.slice(dot + 1));
    }
    return this.table.get(key);
  }

  registerHandler(
    klass: any,
    handler: { call(attr: Nodes.Attribute, value: any): Nodes.Node },
  ): void {
    if (
      typeof klass !== "function" ||
      typeof klass.prototype !== "object" ||
      klass.prototype === null
    ) {
      throw new TypeError("registerHandler requires a constructor function as the first argument");
    }
    this.handlers.unshift([klass, handler]);
  }

  buildBindAttribute(columnName: string, value: unknown): QueryAttribute {
    const type = this.table.typeForAttribute(columnName) as
      | { cast(v: unknown): unknown; serialize(v: unknown): unknown }
      | undefined;
    const castType = type ?? { cast: (v: unknown) => v, serialize: (v: unknown) => v };
    return new QueryAttribute(columnName, value, castType);
  }

  resolveArelAttribute(
    tableName: string,
    columnName: string,
    fallback?: (name: string) => unknown,
  ): Nodes.Attribute {
    // Mirrors predicate_builder.rb:71-73 — routing through `associated_table`
    // (with Rails' block, `lookup_table_klass_from_join_dependencies`) is what
    // resolves a table name that only exists as a join, and what keeps the
    // resulting table's type caster attached.
    // `arelTable` is a TableAlias (a Binary node, not a Table) whenever
    // associated_table had to alias to the hash key (table-metadata.ts:83-84,
    // mirroring table_metadata.rb:44) — both answer `get`, neither is
    // `instanceof Table`.
    const ctx = this._tableContext as {
      associatedTable?: (
        n: string,
        f?: (name: string) => unknown,
      ) => { arelTable: Table | Nodes.TableAlias };
    };
    if (typeof ctx?.associatedTable === "function") {
      return ctx.associatedTable(tableName, fallback).arelTable.get(columnName);
    }
    // Rails' PredicateBuilder always holds a TableMetadata, so `associated_table`
    // is always reachable and never yields a caster-less table; trails' holds the
    // raw Arel table plus the metadata as `_tableContext`, so a builder
    // constructed without one lands here. Attach a caster the way the no-klass
    // branch of associated_table does (table_metadata.rb:47-48) — with
    // type_for_attribute delegating bare, a bare table would raise.
    const klass = (this._tableContext as { klass?: unknown })?.klass ?? null;
    return new Table(tableName, {
      typeCaster: new TypeCasterConnection(klass as never, tableName),
    }).get(columnName);
  }

  with(context: any): PredicateBuilder {
    const table = context?.arelTable ?? this.table;
    const builder = new PredicateBuilder(table);
    builder.handlers = [...this.handlers];
    builder._tableContext = context;
    return builder;
  }

  /** Set context without cloning — use only when constructing a fresh builder. */
  setTableContext(context: any): void {
    this._tableContext = context;
  }

  /**
   * Mirrors Rails `PredicateBuilder#build` force-equality dispatch
   * (`operator ||= table.type(attribute.name).force_equality?(value) && :eq`):
   * runs the multi-source type lookup and, when the resolved type reports
   * `force_equality?(value)`, returns `attribute.eq(bind)` built with the SAME
   * type object that matched — otherwise `null` so the caller falls through to
   * handler dispatch. Type-agnostic: applies to `OID::Range`, `OID::Array`, and
   * `Type::Serialized` alike.
   *
   * @internal
   */
  private _buildForceEqualityOrNull(attribute: Nodes.Attribute, value: unknown): Nodes.Node | null {
    type CastLike = { cast(v: unknown): unknown; serialize(v: unknown): unknown };
    type TypeLike =
      | ({ isForceEquality?(v: unknown): boolean } & Partial<CastLike>)
      | null
      | undefined;
    const lookups = [
      () => {
        const rel = (attribute as unknown as { relation?: unknown }).relation;
        return (rel as { typeForAttribute?(n: string): TypeLike } | undefined)?.typeForAttribute?.(
          attribute.name,
        );
      },
      () =>
        (
          this._tableContext as { typeForAttribute?(n: string): TypeLike } | null
        )?.typeForAttribute?.(attribute.name),
      () => this.table.typeForAttribute(attribute.name) as TypeLike,
    ];
    for (const lookup of lookups) {
      const t = lookup();
      if (t?.isForceEquality?.(value)) {
        // Rails (`predicate_builder.rb#build`) emits a bind for force-equality
        // types: `attribute.eq(build_bind_attribute(attribute.name, value))`. The
        // bind value (e.g. a `Range`) serializes to its pg literal string via the
        // adapter's `typeCast` in the bind path (`type_casted_binds`).
        //
        // Construct the bind with the SAME type object that made the branch true
        // (`table.type(attribute.name)` in Rails). A joined/aliased range attribute
        // may be typed on `attribute.relation` / `_tableContext` but not on
        // `this.table`, so deferring to `buildBindAttribute`'s `this.table` lookup
        // would bind through the identity type and skip `RangeType#serialize`.
        const castType =
          t.cast && t.serialize
            ? (t as CastLike)
            : { cast: (v: unknown) => v, serialize: (v: unknown) => v };
        return attribute.eq(new QueryAttribute(attribute.name, value, castType));
      }
    }
    return null;
  }

  static references(conditions: string[] | Record<string, unknown>): Nodes.SqlLiteral[] {
    const refs: Nodes.SqlLiteral[] = [];
    // Support array form: references(["schema.table.column"]) → ["schema.table"]
    // Rails iterates attributes with each_with_object; for array input the "key" is each element.
    const entries: Array<[string, unknown]> = Array.isArray(conditions)
      ? conditions.map((k) => [k, undefined] as [string, unknown])
      : Object.entries(conditions);
    for (const [key, value] of entries) {
      if (isPlainObject(value)) {
        refs.push(arelSql(key));
      } else {
        const dot = key.lastIndexOf(".");
        if (dot !== -1) {
          refs.push(arelSql(key.slice(0, dot)));
        }
      }
    }
    return refs;
  }

  references(): string[] {
    return [];
  }

  private isRelation(value: unknown): boolean {
    return (
      typeof value === "object" && value !== null && "_modelClass" in value && "toArel" in value
    );
  }

  protected expandFromHash(
    attributes: Record<string, unknown>,
    block?: (key: string) => any,
  ): Nodes.Node[] {
    return this.buildFromHash(attributes);
  }

  private convertDotNotationToHash(attributes: Record<string, unknown>): Record<string, unknown> {
    const converted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(attributes)) {
      if (isPlainObject(value)) {
        const existing = converted[key];
        if (existing && isPlainObject(existing)) {
          Object.assign(existing, value);
        } else {
          converted[key] = { ...value };
        }
      } else {
        const dot = key.lastIndexOf(".");
        if (dot !== -1) {
          const tableName = key.slice(0, dot);
          const colName = key.slice(dot + 1);
          const existing = converted[tableName];
          if (existing && isPlainObject(existing)) {
            existing[colName] = value;
          } else {
            converted[tableName] = { [colName]: value };
          }
        } else {
          converted[key] = value;
        }
      }
    }
    return converted;
  }

  private handlerFor(object: unknown): { call(attr: Nodes.Attribute, value: any): Nodes.Node } {
    for (const [klass, handler] of this.handlers) {
      if (object instanceof klass) return handler;
    }
    if (object instanceof Array) return this.arrayHandler;
    return this.basicObjectHandler;
  }
}

// Rails: `value.respond_to?(:id)`. In Ruby only Active Record records (and things
// defining #id) respond, since Object#id was removed in 1.9 — a bare `Hash` does
// NOT respond_to?(:id), so `where(col: { id: 5 })` routes `{ id: 5 }` to a handler
// rather than dereferencing to `5`. The TS mirror: an object that carries an `id`
// property but is not a plain object literal (those stand in for Ruby Hashes).
function respondsToId(value: unknown): value is { id: unknown } {
  return value != null && typeof value === "object" && "id" in value && !isPlainObject(value);
}

// Read an aggregate's mapped attribute off a value object. Mirrors Rails'
// two call shapes in expand_from_hash: the single-mapping branch uses
// `object.respond_to?(attr) ? object.public_send(attr) : object` (scalar
// passthrough when the value isn't an aggregate object), while the
// multi-mapping branch uses `object.try!(attr)` — which returns nil only when
// the *receiver* is nil and RAISES NoMethodError when a non-nil object doesn't
// respond to `attr` (a broken composed_of mapping is a programmer error, not a
// silent no-match). Getters and methods both resolve — a function value is
// invoked with the object as receiver.
function extractAggregateAttr(object: unknown, attr: string, tryBang: boolean): unknown {
  if (object === null || object === undefined) return tryBang ? null : object;
  if (typeof object === "object" && attr in object) {
    const v = (object as Record<string, unknown>)[attr];
    return typeof v === "function" ? (v as (...a: unknown[]) => unknown).call(object) : v;
  }
  // Multi-mapping (`try!`) surfaces the missing attribute; single-mapping
  // (`respond_to? ? … : object`) falls back to the scalar passthrough.
  if (tryBang) {
    throw new TypeError(
      `composed_of value ${describeAggregateValue(object)} does not respond to mapped attribute '${attr}'`,
    );
  }
  return object;
}

function describeAggregateValue(object: unknown): string {
  const ctor = (object as { constructor?: { name?: string } } | null)?.constructor?.name;
  return ctor ? `(${ctor})` : String(object);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isSameHash(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (!(k in b) || !isSameValue(a[k], b[k])) return false;
  }
  return true;
}

// Value equality that matches Ruby hash equality: scalars by identity, arrays by element.
// Needed so the FK-cycle guard catches cases like { author_id: [1] } == { author_id: [1] }
// where AssociationQueryValue produces a new array each time (different reference, same content).
function isSameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => isSameValue(v, b[i]));
  }
  return false;
}
