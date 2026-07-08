import { Nodes } from "@blazetrails/arel";
import { assertValidKeys } from "@blazetrails/activesupport";

import { arelColumns } from "./query-methods.js";
import { foldMergeJoins, foldMergeOuterJoins } from "./merge-joins.js";
import { foldMergeEagerLoad, foldMergePreloads } from "./merge-preloads.js";

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

  // Rails' Merger#merge mutates the relation it is given and returns it
  // (merger.rb) — it does NOT clone. Non-destructive `merge` gets its fresh copy
  // from `spawn` before ever reaching here (SpawnMethods#merge = `spawn.merge!`),
  // while `merge!` hands `self` straight in. Mirroring that in-place contract is
  // what lets both entry points share this single algorithm; see mergeBang /
  // performMerge in spawn-methods.ts.
  merge(): any {
    const rel = this.relation;
    this.mergeUnscope(rel);
    this.mergeWhereClause(rel);
    this.mergeSelectValues(rel);
    this.mergeMultiValues(rel);
    this.mergeSingleValues(rel);
    this.mergeClauses(rel);
    this.mergeCtes(rel);
    this.mergeEagerLoad(rel);
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

  // Thin wrappers over the folders (merge-preloads.ts); api:compare still maps
  // merger.rb's merge_preloads to this file. Both merge() and merge!() run
  // through Merger#merge, so these fire on every merge.
  private mergeEagerLoad(rel: any): void {
    foldMergeEagerLoad(rel, this.other);
  }

  private mergePreloads(rel: any): void {
    foldMergePreloads(rel, this.other);
  }

  // Thin wrappers over the folders (merge-joins.ts); api:compare still maps
  // merger.rb's merge_joins / merge_outer_joins to this file.
  private mergeJoins(rel: any): void {
    foldMergeJoins(rel, this.other);
  }

  private mergeOuterJoins(rel: any): void {
    foldMergeOuterJoins(rel, this.other);
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
