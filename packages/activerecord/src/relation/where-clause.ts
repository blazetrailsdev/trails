/**
 * WhereClause — manages the collection of WHERE conditions on a Relation.
 *
 * Encapsulates the four parallel condition arrays that Relation uses:
 * object conditions, negated conditions, raw SQL strings, and Arel nodes.
 *
 * Mirrors: ActiveRecord::Relation::WhereClause
 */

import type { Nodes } from "@blazetrails/arel";

export class WhereClause {
  conditions: Array<Record<string, unknown>>;
  notConditions: Array<Record<string, unknown>>;
  rawClauses: string[];
  arelNodes: Nodes.Node[];

  constructor(
    conditions: Array<Record<string, unknown>> = [],
    notConditions: Array<Record<string, unknown>> = [],
    rawClauses: string[] = [],
    arelNodes: Nodes.Node[] = [],
  ) {
    this.conditions = conditions;
    this.notConditions = notConditions;
    this.rawClauses = rawClauses;
    this.arelNodes = arelNodes;
  }

  static empty(): WhereClause {
    return new WhereClause();
  }

  isEmpty(): boolean {
    return (
      this.conditions.length === 0 &&
      this.notConditions.length === 0 &&
      this.rawClauses.length === 0 &&
      this.arelNodes.length === 0
    );
  }

  merge(other: WhereClause): WhereClause {
    return new WhereClause(
      [...this.conditions, ...other.conditions],
      [...this.notConditions, ...other.notConditions],
      [...this.rawClauses, ...other.rawClauses],
      [...this.arelNodes, ...other.arelNodes],
    );
  }

  invert(): WhereClause {
    return new WhereClause(
      [...this.notConditions],
      [...this.conditions],
      [...this.rawClauses],
      [...this.arelNodes],
    );
  }

  except(...columns: string[]): WhereClause {
    const colSet = new Set(columns);
    const filtered = this.conditions
      .map((clause) => {
        const kept: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(clause)) {
          if (!colSet.has(k)) kept[k] = v;
        }
        return kept;
      })
      .filter((clause) => Object.keys(clause).length > 0);
    const filteredNot = this.notConditions
      .map((clause) => {
        const kept: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(clause)) {
          if (!colSet.has(k)) kept[k] = v;
        }
        return kept;
      })
      .filter((clause) => Object.keys(clause).length > 0);
    return new WhereClause(filtered, filteredNot, [...this.rawClauses], [...this.arelNodes]);
  }

  clear(): void {
    this.conditions.length = 0;
    this.notConditions.length = 0;
    this.rawClauses.length = 0;
    this.arelNodes.length = 0;
  }

  clone(): WhereClause {
    return new WhereClause(
      [...this.conditions],
      [...this.notConditions],
      [...this.rawClauses],
      [...this.arelNodes],
    );
  }

  toH(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const cond of this.conditions) {
      Object.assign(result, cond);
    }
    return result;
  }
}
