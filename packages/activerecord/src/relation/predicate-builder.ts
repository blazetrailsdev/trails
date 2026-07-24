import { Nodes, sql as arelSql } from "@blazetrails/arel";
import { Range } from "../connection-adapters/postgresql/oid/range.js";
import { QueryAttribute } from "./query-attribute.js";
import { ArrayHandler } from "./predicate-builder/array-handler.js";
import { RangeHandler, UnboundableBound } from "./predicate-builder/range-handler.js";
import { BasicObjectHandler } from "./predicate-builder/basic-object-handler.js";
import { RelationHandler } from "./predicate-builder/relation-handler.js";
import { AssociationQueryValue } from "./predicate-builder/association-query-value.js";
import { Substitute } from "../statement-cache.js";
import { PolymorphicArrayValue } from "./predicate-builder/polymorphic-array-value.js";
import { argumentError } from "./query-methods.js";
import type { TableMetadata } from "../table-metadata.js";

/**
 * The shape `table.type` answers with. Rails' single source
 * (`TableMetadata#type` → `arel_table.type_for_attribute`) always returns a
 * real Type — casters resolve unknown columns to `Type.default_value`, never
 * nil — so no member is optional and there is no fallback.
 */
interface BoundType {
  cast(x: unknown): unknown;
  serialize(x: unknown): unknown;
  isForceEquality?(v: unknown): boolean;
}

/**
 * Converts hash conditions ({ name: "dean", age: 30 }) into
 * Arel predicate nodes. Used by Relation to build WHERE clauses.
 *
 * Mirrors: ActiveRecord::PredicateBuilder
 */
export class PredicateBuilder {
  private _table: TableMetadata;

  /** @internal */
  get table(): TableMetadata {
    return this._table;
  }

  protected set table(value: TableMetadata) {
    this._table = value;
  }
  private arrayHandler: ArrayHandler;
  private rangeHandler: RangeHandler;
  private basicObjectHandler: BasicObjectHandler;
  private relationHandler: RelationHandler;
  private handlers: Array<[any, { call(attr: Nodes.Attribute, value: any): Nodes.Node }]> = [];

  constructor(table: TableMetadata) {
    this._table = table;
    this.arrayHandler = new ArrayHandler(this);
    this.rangeHandler = new RangeHandler((attribute, v) => {
      // Resolve the type once so sign detection and the cast below agree —
      // single source, like Rails' `build_bind_attribute` (predicate_builder.rb:67-69).
      const type: BoundType = this.table.type(attribute.name);
      const sentinel = this.unboundableSentinel(attribute.name, v, type);
      if (sentinel) return sentinel;
      return type.cast(v);
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
   * equality single-value path, and handles non-numeric out-of-range
   * bounds (e.g. custom types) type-agnostically.
   *
   * Callers pass the type from `table.type(...)` so sign detection uses the
   * same type as the accompanying cast.
   */
  private unboundableSentinel(
    columnName: string,
    value: unknown,
    type: BoundType,
  ): UnboundableBound | null {
    const sign = new QueryAttribute(columnName, value, type).isUnboundable();
    return sign === false ? null : new UnboundableBound(sign);
  }

  buildFromHash(
    conditions: Record<string, unknown>,
    block?: (tableName: string) => unknown,
  ): Nodes.Node[] {
    return this.expandFromHash(this.convertDotNotationToHash(conditions), block);
  }

  protected expandFromHash(
    conditions: Record<string, unknown>,
    block?: (tableName: string) => unknown,
  ): Nodes.Node[] {
    // Mirrors Rails PredicateBuilder#expand_from_hash: `return ["1=0"] if
    // attributes.empty?` (predicate_builder.rb:85). An empty hash is a
    // contradiction, so `where(posts: {})` (nested empty hash) and
    // `where(sink: {})` (empty hash, no foreign key) match nothing. Top-level
    // `where({})` never reaches here — it short-circuits as a blank argument in
    // `Relation#where` (like Rails' `args.first.blank?`), so this fires only for
    // the nested/associated recursion. Like Rails, expansion is always
    // positive: `where.not(...)` inverts the assembled WhereClause one level
    // up (WhereClause#invert), so `where.not(sink: {})` becomes `NOT (1=0)`.
    if (Object.keys(conditions).length === 0) {
      return [arelSql("1=0")];
    }
    const nodes: Nodes.Node[] = [];
    for (const [key, value] of Object.entries(conditions)) {
      if (isPlainObject(value) && !this.table.hasColumn(key)) {
        // Mirrors Rails PredicateBuilder#expand_from_hash: pass the
        // join-dependency resolver block to associatedTable so a nested-hash key
        // that is not a direct reflection (e.g. a join table name) still
        // resolves to the right klass/table instead of being used verbatim. The
        // block is NOT threaded into the recursive expansion: it resolves the
        // caller relation's join deps by table name and has no valid context
        // against the now-resolved associated table (Rails passes &block only to
        // associated_table, then calls expand_from_hash with no block).
        const assocPb: PredicateBuilder = this.table.associatedTable(
          key,
          block as (name: string) => never,
        ).predicateBuilder;
        nodes.push(...assocPb.expandFromHash(value));
      } else if (this.table.isAssociatedWith(key)) {
        const assocNodes = this.buildFromHashAssociation(
          this.table.associatedTable(key),
          key,
          value,
          conditions,
        );
        nodes.push(...assocNodes);
      } else if (this.table.aggregatedWith(key)) {
        nodes.push(...this.buildFromHashAggregate(key, value));
      } else {
        // Rails `self[key, value]` (predicate_builder.rb:53-55): the attribute
        // is read straight off the builder's arel table — dotted keys were
        // already normalized into nested hashes by convertDotNotationToHash.
        nodes.push(this.build(this.table.arelTable.get(key), value));
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
  private buildFromHashAggregate(key: string, value: unknown): Nodes.Node[] {
    const reflection = this.table.reflectOnAggregation(key);
    const mapping: [string, string][] = reflection.mapping();
    // Rails: `values = value.nil? ? [nil] : Array.wrap(value)`.
    const values =
      value === null || value === undefined ? [null] : Array.isArray(value) ? value : [value];
    if (mapping.length === 1 || values.length === 0) {
      const [columnName, aggregateAttr] = mapping[0];
      // Rails: `object.respond_to?(aggr) ? object.public_send(aggr) : object`.
      const mapped = values.map((object) => extractAggregateAttr(object, aggregateAttr, false));
      return [this.build(this.table.arelTable.get(columnName), mapped)];
    }
    // Multi-mapping: one AND-group per object over every mapped column, ORed
    // together (grouping_queries), mirroring expand_from_hash.
    const queryGroups: Nodes.Node[][] = values.map((object) =>
      mapping.map(([fieldAttr, aggregateAttr]) =>
        this.build(
          this.table.arelTable.get(fieldAttr),
          extractAggregateAttr(object, aggregateAttr, true),
        ),
      ),
    );
    return this.groupingQueries(queryGroups);
  }

  /** @internal */
  private buildFromHashAssociation(
    associatedTable: any,
    key: string,
    value: unknown,
    attributes: Record<string, unknown>,
  ): Nodes.Node[] {
    if (associatedTable.isPolymorphicAssociation?.()) {
      const fk = associatedTable.joinForeignKey as string | string[];
      const ft = associatedTable.joinForeignType as string;
      const refl = associatedTable.reflection;
      const pkFor = (klass?: unknown): string | string[] => {
        const pk =
          refl && typeof refl.joinPrimaryKeyFor === "function"
            ? refl.joinPrimaryKeyFor(klass)
            : (associatedTable.joinPrimaryKey ?? "id");
        return Array.isArray(pk) ? pk : String(pk);
      };
      const values = Array.isArray(value) ? value : [value];
      const queries = new PolymorphicArrayValue(
        { joinForeignKey: fk, joinForeignType: ft, joinPrimaryKey: pkFor },
        values,
      ).queries();
      const queryGroups: Nodes.Node[][] = [];
      for (const query of queries) {
        const inner = this.expandFromHash(query);
        if (inner.length === 0) continue;
        queryGroups.push(inner);
      }
      return this.groupingQueries(queryGroups);
    }
    if (associatedTable.isThroughAssociation?.()) {
      const rawPk = associatedTable.primaryKey;
      const assocPb: PredicateBuilder = associatedTable.predicateBuilder;
      if (Array.isArray(rawPk)) {
        // JS object keys can't be arrays, so a composite primary key is routed
        // to an inline mirror of Rails' array-key branch of expand_from_hash
        // (predicate_builder.rb:87-97) instead of the recursive call below.
        if (rawPk.length === 1) {
          const flat = Array.isArray(value) ? value.flat(Infinity) : value;
          return assocPb.expandFromHash({ [rawPk[0]]: flat });
        }
        // Ruby `Array(value)`: nil → [], array stays, scalar wraps.
        const values =
          value === null || value === undefined ? [] : Array.isArray(value) ? value : [value];
        const queryGroups: Nodes.Node[][] = values.map((idsSet) => {
          if (!Array.isArray(idsSet)) {
            throw argumentError(
              `Expected corresponding value for [${rawPk.map((c) => `"${c}"`).join(", ")}] to be an Array`,
            );
          }
          const zipped: Record<string, unknown> = {};
          rawPk.forEach((col, i) => {
            zipped[col] = idsSet[i];
          });
          return assocPb.expandFromHash(zipped);
        });
        return assocPb.groupingQueries(queryGroups);
      }
      // A klass-less through target makes primaryKey null; Rails passes the
      // literal `{nil => value}` into the recursion, where the nil key falls
      // through to `self[nil, value]` and produces degenerate SQL. The JS
      // computed key coerces null to the string "null" — an equally degenerate
      // column reference, so no guard beyond this note.
      return assocPb.expandFromHash({ [rawPk as string]: value });
    }
    // Core non-polymorphic, non-through path.
    const queries = new AssociationQueryValue(associatedTable, value).queries();
    const queryGroups: Nodes.Node[][] = [];
    for (const query of queries) {
      // Cycle guard: prevents infinite recursion when FK name == association name.
      if (isSameHash(query, attributes)) {
        queryGroups.push([this.build(this.table.arelTable.get(key), value)]);
      } else {
        const inner = this.expandFromHash(query);
        if (inner.length === 0) continue;
        queryGroups.push(inner);
      }
    }
    return this.groupingQueries(queryGroups);
  }

  /**
   * Mirrors PredicateBuilder#grouping_queries: a single query group's predicates
   * are returned *flat* (so each column stays an addressable predicate, which
   * `WhereClause#extract_attributes` — and thus `rewhere` — relies on); multiple
   * groups are each AND-reduced and ORed inside a Grouping.
   *
   * @internal
   */
  private groupingQueries(queryGroups: Nodes.Node[][]): Nodes.Node[] {
    if (queryGroups.length === 0) return [];
    if (queryGroups.length === 1) return queryGroups[0];
    // Rails `grouping_queries` (predicate_builder.rb:157-159):
    // `queries.map! { |query| query.reduce(&:and) }` then an n-ary
    // `Arel::Nodes::Or.new(queries)` wrapped in one Grouping. `Node#and`
    // is binary (`And.new [self, right]`), so a 3-predicate group is the
    // nested chain `And([And([p1, p2]), p3])` — mirrored here via the same
    // pairwise reduce, not a flat n-ary `And`. SQL is identical either way
    // (the And visitor joins children without parens), but the AST shape
    // matches Rails for anything walking the tree.
    const reduced = queryGroups.map((inner) => inner.reduce((left, right) => left.and(right)));
    return [new Nodes.Grouping(new Nodes.Or(reduced))];
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
    if (this.table.type(attribute.name).isForceEquality?.(value) === true) {
      return attribute.eq(this.buildBindAttribute(attribute.name, value));
    }
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
    const klass = this.table.klass as { _normalizations?: Map<string, unknown> } | null;
    const normalizations = klass?._normalizations;
    if (!normalizations || !normalizations.has(columnName)) return value;
    return this.table.type(columnName).cast(value);
  }

  buildRangePredicate(attribute: Nodes.Attribute, range: Range): Nodes.Node {
    // Same force-equality precedence `build` applies (predicate_builder.rb:57-69).
    if (this.table.type(attribute.name).isForceEquality?.(range) === true) {
      return attribute.eq(this.buildBindAttribute(attribute.name, range));
    }
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
    const resolved = cols.map((col) => {
      const idx = col.lastIndexOf(".");
      if (idx === -1) return { attribute: this.table.arelTable.get(col), builder: this };
      const associated = this.table.associatedTable(col.slice(0, idx));
      return {
        attribute: associated.arelTable.get(col.slice(idx + 1)),
        builder: associated.predicateBuilder,
      };
    });
    // Single-column degenerate case: a single `IN (...)` predicate is
    // more compact than `c=v1 OR c=v2 OR ...` and typically optimizes
    // identically (or better) on indexed columns.
    if (cols.length === 1) {
      const values = validTuples.map((t) => t[0]);
      return resolved[0].attribute.in(values);
    }
    // Build equalities through `buildBindAttribute` so each value
    // becomes a `QueryAttribute` (= bind param) rather than an
    // `Arel::Nodes::Casted` (= inlined SQL literal). Inlined values
    // bypass `compileWithBinds` / prepared-statement caching and
    // mishandle `StatementCache::Substitute` placeholders.
    //
    // Pre-resolve `Attribute[]` once outside the per-tuple loop —
    // each `arelTable.get` allocates a fresh `Arel::Attribute`.
    // Reusing the resolved attrs keeps large tuple lists
    // allocation-light.
    //
    // Per-tuple AND uses the pairwise `reduce(&:and)` shape (nested
    // binary `And` chain), matching Rails' `grouping_queries`
    // (predicate_builder.rb:157) — not a flat n-ary `And`. SQL output
    // is identical; only the AST shape differs.
    //
    // Deviation from the Rails array-key branch's exact tree: Rails'
    // `grouping_queries` wraps only the outer Or in a single Grouping
    // (and for a single tuple returns the predicates flat, as separate
    // where-clause entries). `buildComposite` must return one node, so
    // each tuple (and the single-tuple case) is wrapped in its own
    // Grouping — semantically a no-op (AND binds tighter than OR) that
    // keeps the emitted `(c1 = ? AND c2 = ?) OR (...)` form stable.
    const groupings: Nodes.Node[] = validTuples.map((tuple) => {
      const eqs = resolved.map(({ attribute, builder }, i) =>
        attribute.eq(builder.buildBindAttribute(attribute.name, tuple[i])),
      );
      return new Nodes.Grouping(eqs.reduce((left, right) => left.and(right)));
    });
    if (groupings.length === 1) return groupings[0];
    // n-ary `Or(children[])` matches Rails: `grouping_queries` builds
    // `Arel::Nodes::Or.new(queries)` over the whole array (Arel's `Or`
    // extends `Nary` in Rails 8.0.2 too).
    return new Nodes.Grouping(new Nodes.Or(groupings));
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
    return new QueryAttribute(columnName, value, this.table.type(columnName));
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
    return this.table
      .associatedTable(tableName, fallback as (name: string) => never)
      .arelTable.get(columnName);
  }

  with(table: TableMetadata): PredicateBuilder {
    // Rails: `other = dup; other.table = table` — dup shares the @handlers
    // ARRAY OBJECT, so handlers registered on the model builder later are
    // visible to builders already derived for associated metadata (and vice
    // versa). A `[...this.handlers]` snapshot would leave them stale.
    const builder = new PredicateBuilder(table);
    builder.handlers = this.handlers;
    return builder;
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
