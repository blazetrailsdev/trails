/**
 * JoinBase — the root node of a join dependency tree.
 *
 * Represents the base model's table in a JOIN query.
 *
 * Mirrors: ActiveRecord::Associations::JoinDependency::JoinBase
 */

import type { Base } from "../../base.js";
import type { Table } from "@blazetrails/arel";
import { JoinPart } from "./join-part.js";

export class JoinBase extends JoinPart {
  private readonly _table: Table;

  constructor(baseKlass: typeof Base, table: Table, children?: JoinPart[]) {
    super(baseKlass, children);
    this._table = table;
  }

  get table(): Table {
    return this._table;
  }

  isMatch(other: JoinPart): boolean {
    if (this === other) return true;
    return super.isMatch(other) && this.baseKlass === other.baseKlass;
  }
}
