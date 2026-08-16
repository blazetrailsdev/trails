import { Nodes } from "@blazetrails/arel";
import { assertValidKeys, isBlank } from "@blazetrails/activesupport";

import { JoinDependency } from "../associations/join-dependency.js";
import { Relation } from "../relation.js";
import type { ValueMethod } from "../relation.js";
import type { AssociationSpec } from "./query-methods.js";
import {
  arelColumns,
  constructJoinDependency,
  QueryMethodBangs,
  structuralUnionEq,
} from "./query-methods.js";

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
  /**
   * Mirrors: `ActiveRecord::Relation::Merger::NORMAL_VALUES`
   * (merger.rb:52-56) — `Relation::VALUE_METHODS - Relation::CLAUSE_METHODS -
   * [...]`.
   *
   * Ruby resolves `Relation::VALUE_METHODS` in the class body under Zeitwerk;
   * ESM would have to evaluate `relation.ts` while it is still mid-eval
   * (relation.ts -> spawn-methods.ts -> merger.ts -> relation.ts), so the
   * constant is read at call time — where Ruby's autoload resolves it — via a
   * static getter. See CLAUDE.md, "Call-time constant resolution".
   */
  static get NORMAL_VALUES(): readonly ValueMethod[] {
    const excluded: readonly string[] = [
      ...Relation.CLAUSE_METHODS,
      "select",
      "includes",
      "preload",
      "joins",
      "leftOuterJoins",
      "order",
      "reverseOrder",
      "lock",
      "createWith",
      "reordering",
    ];
    return Relation.VALUE_METHODS.filter((name) => !excluded.includes(name));
  }

  merge(): any {
    const rel = this.relation;
    for (const name of Merger.NORMAL_VALUES) {
      const value = this.values[name];
      // The unless clause is here mostly for performance reasons (since the `send` call might be
      // moderately expensive), most of the time the value is going to be `nil` or `.blank?`, the
      // only catch is that `false.blank?` returns `true`, so there needs to be an extra check so
      // that explicit `false` values don't fall through the cracks.
      if (value == null || (isBlank(value) && value !== false)) continue;
      const bang = `${name}Bang`;
      if (Array.isArray(value)) rel[bang](...value);
      else rel[bang](value);
    }
    // `references_values` has a trails-only sidecar, `_manualReferences`,
    // marking the refs a caller asked for explicitly (vs. those inferred from an
    // `includes`). `references!` does not maintain it, so the loop's
    // `references` step cannot carry it and it rides along here.
    for (const ref of this.other._manualReferences ?? []) {
      if (!rel._manualReferences.includes(ref)) rel._manualReferences.push(ref);
    }

    if (this.other._isNone) rel._isNone = true;

    this.mergeSelectValues(rel);
    this.mergeMultiValues(rel);
    this.mergeSingleValues(rel);
    this.mergeClauses(rel);
    this.mergePreloads(rel);
    this.mergeJoins(rel);
    this.mergeOuterJoins(rel);
    return rel;
  }

  private mergeSelectValues(rel: any): void {
    // Mirrors Rails' Merger#merge_select_values: union (`|=`) the other
    // relation's select_values into ours rather than replacing. When the two
    // relations target different models, the other side's bare columns are
    // first resolved against *its own* table via arel_columns so a symbol like
    // `:body` qualifies to `comments.body` instead of the receiver's table.
    const otherSelect = this.other.selectValues;
    if (otherSelect == null || otherSelect.length === 0) return;
    const columns =
      this.other.model === rel.model ? otherSelect : arelColumns.call(this.other, otherSelect);
    rel._selectBang(...columns);
  }

  // Rails merges :eager_load as a NORMAL_VALUE through Merger#merge's generic
  // loop (`relation.eager_load!(*value)`, merger.rb:52-68), not as part of
  // merge_preloads — it crosses the model boundary untouched.
  private mergeEagerLoad(rel: any): void {
    const otherEagerLoad = this.other.eagerLoadValues;
    if (otherEagerLoad.length > 0) rel.eagerLoadBang(...otherEagerLoad);
  }

  private mergePreloads(rel: any): void {
    if (this.other.preloadValues.length === 0 && this.other.includesValues.length === 0) return;

    if (this.other.model === rel.model) {
      if (this.other.preloadValues.length > 0) {
        const preloadValues = rel.preloadValues;
        rel.preloadValues = preloadValues.concat(
          this.other.preloadValues.filter(
            (v: AssociationSpec) =>
              !preloadValues.some((seen: unknown) => structuralUnionEq(seen, v)),
          ),
        );
      }
      if (this.other.includesValues.length > 0) {
        const includesValues = rel.includesValues;
        rel.includesValues = includesValues.concat(
          this.other.includesValues.filter(
            (v: AssociationSpec) =>
              !includesValues.some((seen: unknown) => structuralUnionEq(seen, v)),
          ),
        );
      }
      return;
    }

    const reflection = rel.model
      .reflectOnAllAssociations()
      .find((r: { className: string }) => r.className === this.other.model.name);
    if (!reflection) return;

    if (this.other.preloadValues.length > 0) {
      rel.preloadBang({ [reflection.name]: this.other.preloadValues });
    }
    if (this.other.includesValues.length > 0) {
      rel.includesBang({ [reflection.name]: this.other.includesValues });
    }
  }

  private mergeJoins(rel: any): void {
    const other = this.other;
    // trails-only: raw Arel join clauses live outside joins_values, so they are
    // copied alongside them.
    const clauses = other._joinClauses ?? [];
    if (clauses.length > 0) rel._joinClauses.push(...clauses);

    const joinsValues = other.joinsValues ?? [];
    if (joinsValues.length === 0) return;
    if (other.model === rel.model) {
      // merger.rb:121 `relation.joins_values |= other.joins_values` — one union
      // over the whole store, named and raw alike.
      for (const v of joinsValues) {
        if (!rel.joinsValues.some((existing: unknown) => structuralUnionEq(existing, v)))
          rel.joinsValues = [...rel.joinsValues, v];
      }
      return;
    }

    const associations: unknown[] = [];
    const others: unknown[] = [];
    for (const v of joinsValues) {
      if (!(v instanceof JoinDependency) && other._isNamedJoinValue(v)) {
        associations.push(v);
      } else {
        others.push(v);
      }
    }
    const joinDependency = constructJoinDependency.call(
      other,
      associations as AssociationSpec[],
      Nodes.InnerJoin,
    );
    QueryMethodBangs.joinsBang.call(rel, joinDependency as any, ...(others as any[]));
  }

  private mergeOuterJoins(rel: any): void {
    const other = this.other;
    const otherLeft = other.leftOuterJoinsValues ?? [];
    if (otherLeft.length === 0) return;
    if (other.model === rel.model) {
      for (const v of otherLeft) {
        if (!rel.leftOuterJoinsValues.some((seen: unknown) => structuralUnionEq(seen, v)))
          rel.leftOuterJoinsValues = [...rel.leftOuterJoinsValues, v];
      }
      return;
    }

    const associations: unknown[] = [];
    const others: unknown[] = [];
    for (const v of otherLeft) {
      if (!(v instanceof JoinDependency)) {
        associations.push(v);
      } else {
        others.push(v);
      }
    }
    const joinDependency = constructJoinDependency.call(
      other,
      associations as AssociationSpec[],
      Nodes.OuterJoin,
    );
    QueryMethodBangs.leftOuterJoinsBang.call(rel, joinDependency as any, ...(others as any[]));
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
    const table: any = this.other._model?.arelTable;
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
    return clause;
  }

  private mergeMultiValues(rel: any): void {
    if (this.other.orderValues && this.other.orderValues.length > 0) {
      const sameKlass = this.other._model === rel._model;
      rel.orderValues = sameKlass
        ? [...this.other.orderValues]
        : this.other.orderValues.map((c: unknown) => this.qualifyOrderForOther(c));
    }
  }

  // Mirrors merge_single_values (merger.rb:169-174): every other single value
  // rides the NORMAL_VALUES loop; only `lock` (`||=`, so the receiver wins) and
  // `create_with` (hash-wise, the other side winning) need their own arm.
  private mergeSingleValues(rel: any): void {
    if (this.other.lockValue) rel.lockValue ||= this.other.lockValue;

    if (!isBlank(this.other.createWithValue)) {
      rel.createWithValue = { ...(rel.createWithValue ?? {}), ...this.other.createWithValue };
    }
  }

  private mergeClauses(rel: any): void {
    if (this.isReplaceFromClause() && this.other.fromClause) {
      rel.fromClause = this.other.fromClause;
    }

    const whereClause = rel.whereClause.merge(this.other.whereClause);
    if (!whereClause.isEmpty()) rel.whereClause = whereClause;

    const havingClause = rel.havingClause.merge(this.other.havingClause);
    if (!havingClause.isEmpty()) rel.havingClause = havingClause;
  }

  private isReplaceFromClause(): boolean {
    const relationFrom = this.relation.fromClause;
    const otherFrom = this.other.fromClause;
    // Rails replace_from_clause? also requires same base_class, so a cross-model
    // merge (e.g. Comment.merge(Post.from("posts"))) keeps the receiver's own
    // FROM (its base table) rather than swapping in the other model's table.
    return (
      (!relationFrom || relationFrom.isEmpty()) &&
      !!otherFrom &&
      !otherFrom.isEmpty() &&
      this.relation.model?.baseClass === this.other.model?.baseClass
    );
  }
}

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
    assertValidKeys(hash, Relation.VALUE_METHODS as string[]);
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
