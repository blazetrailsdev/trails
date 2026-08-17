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
    return Relation.VALUE_METHODS.filter(
      (name) =>
        !(Relation.CLAUSE_METHODS as readonly string[]).includes(name) &&
        ![
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
        ].includes(name),
    );
  }

  // Rails' Merger#merge mutates the relation it is given and returns it
  // (merger.rb) — it does NOT clone. Non-destructive `merge` gets its fresh copy
  // from `spawn` before ever reaching here (SpawnMethods#merge = `spawn.merge!`),
  // while `merge!` hands `self` straight in. Mirroring that in-place contract is
  // what lets both entry points share this single algorithm; see mergeBang /
  // performMerge in spawn-methods.ts.
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

    if (this.other.isNullRelation()) rel.noneBang();

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

  // Mirrors merge_multi_values (merger.rb:154-167).
  private mergeMultiValues(rel: any): void {
    if (this.other.reorderingValue) {
      // override any order specified in the original relation
      rel.reorderBang(...this.other.orderValues);
    } else if (this.other.orderValues.length > 0) {
      // merge in order_values from relation
      rel.orderBang(...this.other.orderValues);
    }

    const extensions = this.other.extensions.filter(
      (mod: unknown) => !rel.extensions.includes(mod),
    );
    if (extensions.length > 0) rel.extendingBang(...extensions);
  }

  // Mirrors merge_single_values (merger.rb:169-174).
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
    // `Relation.create(relation.model, table:, predicate_builder:)`
    // (merger.rb:26-30) — trails' constructor takes the same three.
    const other: any = new Relation(
      this.relation.model,
      this.relation.table,
      this.relation.predicateBuilder,
    );
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
