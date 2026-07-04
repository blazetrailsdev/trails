import { Nodes } from "@blazetrails/arel";
import { assertValidKeys } from "@blazetrails/activesupport";

import { arelColumns, constructJoinDependency, structuralUnionEq } from "./query-methods.js";

/**
 * Merges two Relations together, combining their conditions,
 * joins, and other clauses.
 *
 * Mirrors: ActiveRecord::Relation::Merger
 */
export class Merger {
  readonly relation: any;
  readonly values: Record<string, unknown>;
  readonly other: any;

  constructor(relation: any, other: any) {
    this.relation = relation;
    this.other = other;
    this.values = typeof other.values === "function" ? other.values() : {};
  }

  merge(): any {
    const rel = this.relation._clone();
    this.mergeUnscope(rel);
    this.mergeWhereClause(rel);
    this.mergeSelectValues(rel);
    this.mergeMultiValues(rel);
    this.mergeSingleValues(rel);
    this.mergeClauses(rel);
    this.mergeCtes(rel);
    this.mergePreloads(rel);
    this.mergeJoins(rel);
    this.mergeOuterJoins(rel);
    if (this.other._isNone) rel._isNone = true;
    return rel;
  }

  // Rails merges `with` through the NORMAL_VALUES loop (`relation.with!(*value)`),
  // appending the other relation's CTEs. trails stores them in `_ctes`; mirror
  // the append so a merged relation keeps both sides' common table expressions.
  private mergeCtes(rel: any): void {
    if (this.other._ctes?.length > 0) rel._ctes = [...rel._ctes, ...this.other._ctes];
  }

  // Rails merger.rb processes :unscope as a NORMAL_VALUE: before the clauses are
  // merged it calls `relation.unscope!(*value)`, re-applying the other relation's
  // resets to the merged relation. This is what lets
  // `where(...).merge(unscope(:where))` clear the accumulated where clause.
  private mergeUnscope(rel: any): void {
    const unscopeValues = this.other._unscopeValues ?? [];
    if (unscopeValues.length > 0) rel.unscopeBang(...unscopeValues);
  }

  private mergeWhereClause(rel: any): void {
    if (!this.other._whereClause.isEmpty()) {
      rel._whereClause = rel._whereClause.merge(this.other._whereClause);
    }
  }

  private mergeSelectValues(rel: any): void {
    // Mirrors Rails' Merger#merge_select_values: union (`|=`) the other
    // relation's select_values into ours rather than replacing. When the two
    // relations target different models, the other side's bare columns are
    // first resolved against *its own* table via arel_columns so a symbol like
    // `:body` qualifies to `comments.body` instead of the receiver's table.
    const otherSelect = this.other._selectColumns;
    if (otherSelect == null || otherSelect.length === 0) return;
    const columns =
      this.other._modelClass === rel._modelClass
        ? otherSelect
        : arelColumns.call(this.other, otherSelect);
    rel._selectBang(...columns);
  }

  private mergePreloads(rel: any): void {
    if (this.other._preloadAssociations && this.other._preloadAssociations.length > 0) {
      rel._preloadAssociations = [
        ...(rel._preloadAssociations ?? []),
        ...this.other._preloadAssociations,
      ];
    }
    if (this.other._includesAssociations && this.other._includesAssociations.length > 0) {
      rel._includesAssociations = [
        ...(rel._includesAssociations ?? []),
        ...this.other._includesAssociations,
      ];
    }
    if (this.other._eagerLoadAssociations && this.other._eagerLoadAssociations.length > 0) {
      rel._eagerLoadAssociations = [
        ...(rel._eagerLoadAssociations ?? []),
        ...this.other._eagerLoadAssociations,
      ];
    }
  }

  private mergeJoins(rel: any): void {
    // Rails: joins_values and left_outer_joins_values are separate arrays, so each
    // merge helper unions its own array independently (no interleaving in Rails).
    // Our codebase mirrors that split: explicit SQL joins go into _joinClauses,
    // Arel/string join nodes into _joinValues, and named left-outer-join associations
    // into _leftOuterJoinsValues. Each is merged independently below.
    // Arel::Nodes::InnerJoin is the type used for same-model inner joins in Rails'
    // cross-model merge path.
    const clauses: Array<{ type: string; table: string; on: string; quoted?: boolean }> =
      this.other._joinClauses ?? [];
    if (clauses.length > 0) rel._joinClauses.push(...clauses);
    // Rails merge_joins unions with `relation.joins_values |= other.joins_values`
    // (merger.rb:121), so an identical Arel join node already present is not
    // re-emitted. Merging a relation into itself (a self-merge that shares the
    // same join node) would otherwise duplicate the join and make its columns
    // ambiguous. Dedup structurally via the Arel node's `eql` (falling back to
    // reference/`===` for strings and nodes without it).
    for (const v of (this.other._joinValues ?? []) as unknown[]) {
      const dup = (rel._joinValues as unknown[]).some((existing) =>
        typeof (v as any)?.eql === "function" && v?.constructor === (existing as any)?.constructor
          ? (v as any).eql(existing)
          : v === existing,
      );
      if (!dup) rel._joinValues.push(v);
    }
    // Rails merge_joins (merger.rb): when other.klass == relation.klass the
    // association names union directly into joins_values; otherwise Merger builds
    // a single InnerJoin JoinDependency against other.klass and stashes it. We
    // mirror both: same-klass names fold into _namedInnerJoins (resolved on the
    // receiver); cross-klass names (Hash | Symbol/String | Array — every shape
    // Rails treats as an association) build a JoinDependency on `other` whose
    // AliasTracker handles nested-through / HABTM correctly.
    const sameKlass = this.other._modelClass === rel._modelClass;
    const otherNamed: unknown[] = this.other._namedInnerJoins ?? [];
    if (sameKlass) {
      for (const v of otherNamed) {
        // joins_values |= dedups structurally-equal Hash specs (eql?/hash), so a
        // same-klass merge folds an equal spec — not by JS reference identity.
        if (!rel._namedInnerJoins.some((seen: unknown) => structuralUnionEq(seen, v)))
          rel._namedInnerJoins.push(v);
      }
    } else if (otherNamed.length > 0) {
      rel._namedInnerJoinDeps.push(
        constructJoinDependency.call(this.other, otherNamed as any, Nodes.InnerJoin),
      );
    }
    // Carry forward any cross-klass dependencies the source already accumulated.
    rel._namedInnerJoinDeps.push(...(this.other._namedInnerJoinDeps ?? []));
  }

  // Mirrors Rails merge_outer_joins (merger.rb): when other.klass == relation.klass
  // the left_outer_joins association names union directly; otherwise Merger builds a
  // single OuterJoin JoinDependency against other.klass (the names can't resolve on
  // the receiver's model) and stashes it via left_outer_joins!. We mirror both:
  // same-klass names fold into _leftOuterJoinsValues; cross-klass names build a
  // JoinDependency on `other` stashed in _leftOuterJoinDeps.
  private mergeOuterJoins(rel: any): void {
    const otherLeft: unknown[] = this.other._leftOuterJoinsValues ?? [];
    const sameKlass = this.other._modelClass === rel._modelClass;
    if (sameKlass) {
      for (const v of otherLeft) {
        if (!rel._leftOuterJoinsValues.some((seen: unknown) => structuralUnionEq(seen, v)))
          rel._leftOuterJoinsValues.push(v);
      }
    } else if (otherLeft.length > 0) {
      rel._leftOuterJoinDeps.push(
        constructJoinDependency.call(this.other, otherLeft as any, Nodes.OuterJoin),
      );
    }
    // Carry forward any cross-klass dependencies the source already accumulated.
    rel._leftOuterJoinDeps.push(...(this.other._leftOuterJoinDeps ?? []));
  }

  // Rails stores order_values as Arel nodes already qualified against the
  // origin model's table (preprocess_order_args at order! time), so a
  // cross-model merge carries `authors.name` rather than re-resolving the bare
  // column against the receiver. trails defers qualification to SQL build
  // (against the *receiver* table), so a bare-column order from another model
  // would wrongly bind to the receiver (`posts.name`). Mirror Rails by
  // qualifying the other relation's bare-column order clauses against ITS table
  // before copying. Dotted refs, raw SQL, and existing Arel nodes pass through.
  private qualifyOrderForOther(clause: unknown): unknown {
    if (clause instanceof Nodes.Node) return clause;
    const table: any = this.other._modelClass?.arelTable;
    if (!table) return clause;
    const asNode = (col: string, dir: string): unknown => {
      const attr = table.get(col);
      return dir.toLowerCase() === "desc" ? new Nodes.Descending(attr) : new Nodes.Ascending(attr);
    };
    const bareColumn = (s: string): RegExpMatchArray | null =>
      s.trim().match(/^([A-Za-z_$][\w$]*)(?:\s+(ASC|DESC))?$/i);
    if (typeof clause === "string") {
      const m = bareColumn(clause);
      return m ? asNode(m[1], m[2] ?? "asc") : clause;
    }
    if (Array.isArray(clause) && typeof clause[0] === "string" && !clause[0].includes(".")) {
      return asNode(clause[0], String(clause[1] ?? "asc"));
    }
    return clause;
  }

  private mergeMultiValues(rel: any): void {
    if (this.other._orderClauses && this.other._orderClauses.length > 0) {
      const sameKlass = this.other._modelClass === rel._modelClass;
      rel._orderClauses = sameKlass
        ? [...this.other._orderClauses]
        : this.other._orderClauses.map((c: unknown) => this.qualifyOrderForOther(c));
    }
    if (this.other._groupColumns && this.other._groupColumns.length > 0) {
      rel._groupColumns.push(...this.other._groupColumns);
    }
    if (this.other._annotations && this.other._annotations.length > 0) {
      rel._annotations.push(...this.other._annotations);
    }
    if (this.other._referencesValues) {
      for (const ref of this.other._referencesValues) {
        if (!rel._referencesValues.includes(ref)) rel._referencesValues.push(ref);
      }
    }
    if (this.other._manualReferences) {
      for (const ref of this.other._manualReferences) {
        if (!rel._manualReferences.includes(ref)) rel._manualReferences.push(ref);
      }
    }
  }

  private mergeSingleValues(rel: any): void {
    if (this.other._limitValue !== null && this.other._limitValue !== undefined) {
      rel._limitValue = this.other._limitValue;
    }
    if (this.other._offsetValue !== null && this.other._offsetValue !== undefined) {
      rel._offsetValue = this.other._offsetValue;
    }
    if (this.other._isDistinct) rel._isDistinct = true;
    if (this.other._lockValue) rel._lockValue = this.other._lockValue;
    if (this.other._isReadonly) rel._isReadonly = true;
    if (this.other._skipQueryCache) rel._skipQueryCache = true;
    if (this.other._isStrictLoading !== undefined)
      rel._isStrictLoading = this.other._isStrictLoading;
    // Mirrors merge_single_values (merger.rb): create_with merges hash-wise with
    // the other relation's values winning (last-wins precedence).
    if (this.other._createWithAttrs && Object.keys(this.other._createWithAttrs).length > 0) {
      rel._createWithAttrs = { ...(rel._createWithAttrs ?? {}), ...this.other._createWithAttrs };
    }
  }

  private mergeClauses(rel: any): void {
    if (!this.other._havingClause.isEmpty()) {
      rel._havingClause = rel._havingClause.merge(this.other._havingClause);
    }
    if (this.isReplaceFromClause() && this.other._fromClause) {
      rel._fromClause = this.other._fromClause;
    }
  }

  private isReplaceFromClause(): boolean {
    const relationFrom = this.relation._fromClause;
    const otherFrom = this.other._fromClause;
    // Rails replace_from_clause? also requires same base_class, so a cross-model
    // merge (e.g. Comment.merge(Post.from("posts"))) keeps the receiver's own
    // FROM (its base table) rather than swapping in the other model's table.
    return (
      (!relationFrom || relationFrom.isEmpty()) &&
      !!otherFrom &&
      !otherFrom.isEmpty() &&
      this.relation._modelClass?.baseClass === this.other._modelClass?.baseClass
    );
  }
}

/**
 * Rails `Relation::VALUE_METHODS` (relation.rb:54-65) — the union of
 * MULTI_VALUE_METHODS, SINGLE_VALUE_METHODS, and CLAUSE_METHODS — expressed as
 * trails' camelCase keys. These are the only keys a hash `merge` accepts; each
 * dispatches to the matching value-method bang setter on the built relation.
 */
const VALUE_METHODS = [
  // MULTI_VALUE_METHODS
  "includes",
  "eagerLoad",
  "preload",
  "select",
  "group",
  "order",
  "joins",
  "leftOuterJoins",
  "references",
  "extending",
  "unscope",
  "optimizerHints",
  "annotate",
  "with",
  // SINGLE_VALUE_METHODS
  "limit",
  "offset",
  "lock",
  "readonly",
  "reordering",
  "strictLoading",
  "reverseOrder",
  "distinct",
  "createWith",
  "skipQueryCache",
  // CLAUSE_METHODS
  "where",
  "having",
  "from",
];

/**
 * Merges a hash of value-method directives into a Relation.
 *
 * Mirrors: ActiveRecord::Relation::HashMerger. Rails validates the hash keys
 * against `Relation::VALUE_METHODS` (raising ArgumentError on any unknown key),
 * then builds a relation from the hash by dispatching each key to its
 * value-method bang setter and merges that via `Merger`.
 */
export class HashMerger {
  readonly relation: any;
  readonly hash: Record<string, unknown>;

  constructor(relation: any, hash: Record<string, unknown>) {
    // Rails `HashMerger#initialize`: `hash.assert_valid_keys(*VALUE_METHODS)`.
    assertValidKeys(hash, VALUE_METHODS);
    this.relation = relation;
    this.hash = hash;
  }

  merge(): any {
    return new Merger(this.relation, this.buildOther()).merge();
  }

  // Rails `HashMerger#other`: build a fresh relation and apply each hash value
  // to it via `public_send("#{k}!", *v)` so where-value interpolation etc.
  // happens on the built relation rather than by directly merging raw values.
  private buildOther(): any {
    const other = this.relation._newRelation();
    for (const [key, value] of Object.entries(this.hash)) {
      // `select` dispatches to `_select!` (Rails renames `:select` → `:_select`
      // to avoid Enumerable#select!); trails mirrors this with `_selectBang`.
      // Every other key routes to its `#{key}!` value-method, exactly as Rails'
      // `other.public_send("#{k}!", *v)`. Note `:reordering` is in VALUE_METHODS
      // but Rails defines no `reordering!` (only `reorder!`, query_methods.rb:760),
      // so `merge(reordering: ...)` raises there too — we let it fall through and
      // fail the same way rather than inventing a working path.
      const method = key === "select" ? "_selectBang" : `${key}Bang`;
      if (Array.isArray(value)) {
        other[method](...value);
      } else {
        other[method](value);
      }
    }
    return other;
  }
}
