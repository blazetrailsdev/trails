import { Nodes } from "@blazetrails/arel";
import { any, assertValidKeys, isBlank, isPlainObject } from "@blazetrails/activesupport";

import { Relation } from "../relation.js";
import type { ValueMethod } from "../relation.js";
import type { AssociationSpec } from "./query-methods.js";
import { isEmpty, partition, union } from "@blazetrails/ruby-compat";
import { arelColumns, constructJoinDependency, QueryMethods } from "./query-methods.js";

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

  private mergeSelectValues(rel: any): void {
    if (isEmpty(this.other.selectValues)) return;

    if (this.other.model === rel.model) {
      rel._selectBang(...this.other.selectValues);
    } else {
      rel._selectBang(...arelColumns.call(this.other, this.other.selectValues));
    }
  }

  private mergePreloads(rel: any): void {
    if (isEmpty(this.other.preloadValues) && isEmpty(this.other.includesValues)) return;

    if (this.other.model === rel.model) {
      if (!isEmpty(this.other.preloadValues)) {
        rel.preloadValues = union(rel.preloadValues, this.other.preloadValues);
      }
      if (!isEmpty(this.other.includesValues)) {
        rel.includesValues = union(rel.includesValues, this.other.includesValues);
      }
      return;
    }

    const reflection = rel.model
      .reflectOnAllAssociations()
      .find((r: { className: string }) => r.className === this.other.model.name);
    if (!reflection) return;

    if (!isEmpty(this.other.preloadValues)) {
      rel.preloadBang({ [`:${reflection.name}`]: this.other.preloadValues });
    }
    if (!isEmpty(this.other.includesValues)) {
      rel.includesBang({ [`:${reflection.name}`]: this.other.includesValues });
    }
  }

  private mergeJoins(rel: any): void {
    const other = this.other;
    if (isEmpty(other.joinsValues)) return;

    if (other.model === rel.model) {
      rel.joinsValues = union(rel.joinsValues, other.joinsValues);
    } else {
      const [associations, others] = partition(other.joinsValues as unknown[], (join) => {
        if (
          isPlainObject(join) ||
          (typeof join === "string" && join.startsWith(":")) ||
          Array.isArray(join)
        ) {
          return true;
        }
      });

      const joinDependency = constructJoinDependency.call(
        other,
        associations as AssociationSpec[],
        Nodes.InnerJoin,
      );
      QueryMethods.joinsBang.call(rel, joinDependency as any, ...(others as any[]));
    }
  }

  private mergeOuterJoins(rel: any): void {
    const other = this.other;
    if (isEmpty(other.leftOuterJoinsValues)) return;

    if (other.model === rel.model) {
      rel.leftOuterJoinsValues = union(rel.leftOuterJoinsValues, other.leftOuterJoinsValues);
    } else {
      const [associations, others] = partition(other.leftOuterJoinsValues as unknown[], (join) => {
        if (
          isPlainObject(join) ||
          (typeof join === "string" && join.startsWith(":")) ||
          Array.isArray(join)
        ) {
          return true;
        }
      });

      const joinDependency = constructJoinDependency.call(
        other,
        associations as AssociationSpec[],
        Nodes.OuterJoin,
      );
      QueryMethods.leftOuterJoinsBang.call(rel, joinDependency as any, ...(others as any[]));
    }
  }

  private mergeMultiValues(rel: any): void {
    if (this.other.reorderingValue) {
      rel.reorderBang(...this.other.orderValues);
    } else if (any(this.other.orderValues)) {
      rel.orderBang(...this.other.orderValues);
    }

    const extensions = this.other.extensions.filter(
      (mod: unknown) => !rel.extensions.includes(mod),
    );
    if (any(extensions)) rel.extendingBang(...extensions);
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
