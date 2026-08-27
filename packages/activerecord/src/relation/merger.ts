import { Nodes } from "@blazetrails/arel";
import { assertValidKeys, isBlank, isPlainObject } from "@blazetrails/activesupport";

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

export class Merger {
  readonly relation: any;
  readonly values: Record<string, unknown>;
  readonly other: any;

  constructor(relation: any, other: any) {
    this.relation = relation;
    this.other = other;
    this.values = typeof other.values === "function" ? other.values() : {};
  }

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

  merge(): any {
    const rel = this.relation;
    for (const name of Merger.NORMAL_VALUES) {
      const value = this.values[name];
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

  /** @missingRailsCall empty? — PERMANENT */
  private mergeSelectValues(rel: any): void {
    const otherSelect = this.other.selectValues;
    if (otherSelect == null || otherSelect.length === 0) return;
    const columns =
      this.other.model === rel.model ? otherSelect : arelColumns.call(this.other, otherSelect);
    rel._selectBang(...columns);
  }

  /** @missingRailsCall empty? — PERMANENT */
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
      rel.preloadBang({ [`:${reflection.name}`]: this.other.preloadValues });
    }
    if (this.other.includesValues.length > 0) {
      rel.includesBang({ [`:${reflection.name}`]: this.other.includesValues });
    }
  }

  /** @missingRailsCall empty? — PERMANENT */
  private mergeJoins(rel: any): void {
    const other = this.other;
    const joinsValues = other.joinsValues ?? [];
    if (joinsValues.length === 0) return;
    if (other.model === rel.model) {
      for (const v of joinsValues) {
        if (!rel.joinsValues.some((existing: unknown) => structuralUnionEq(existing, v)))
          rel.joinsValues = [...rel.joinsValues, v];
      }
      return;
    }

    const associations: unknown[] = [];
    const others: unknown[] = [];
    for (const v of joinsValues) {
      if (isPlainObject(v) || Array.isArray(v) || (typeof v === "string" && v.startsWith(":"))) {
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

  /** @missingRailsCall empty? — PERMANENT */
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

  /** @missingRailsCall any? — PERMANENT */
  private mergeMultiValues(rel: any): void {
    if (this.other.reorderingValue) {
      rel.reorderBang(...this.other.orderValues);
    } else if (this.other.orderValues.length > 0) {
      rel.orderBang(...this.other.orderValues);
    }

    const extensions = this.other.extensions.filter(
      (mod: unknown) => !rel.extensions.includes(mod),
    );
    if (extensions.length > 0) rel.extendingBang(...extensions);
  }

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
    return (
      (!relationFrom || relationFrom.isEmpty()) &&
      !!otherFrom &&
      !otherFrom.isEmpty() &&
      this.relation.model?.baseClass === this.other.model?.baseClass
    );
  }
}

export class HashMerger {
  readonly relation: any;
  readonly hash: Record<string, unknown>;

  constructor(relation: any, hash: Record<string, unknown>) {
    assertValidKeys(hash, Relation.VALUE_METHODS as string[]);
    this.relation = relation;
    this.hash = hash;
  }

  merge(): any {
    return new Merger(this.relation, this.other()).merge();
  }

  private other(): any {
    const other: any = Relation.create(this.relation.model, {
      table: this.relation.table,
      predicateBuilder: this.relation.predicateBuilder,
    });
    for (const [key, value] of Object.entries(this.hash)) {
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
