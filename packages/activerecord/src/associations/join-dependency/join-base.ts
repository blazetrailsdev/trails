/**
 * JoinBase — the root node of a join dependency tree.
 *
 * Represents the base model's table in a JOIN query.
 *
 * Mirrors: ActiveRecord::Associations::JoinDependency::JoinBase
 */

import type { Base } from "../../base.js";
import { JoinPart } from "./join-part.js";

export class JoinBase extends JoinPart {
  constructor(baseKlass: typeof Base, children?: JoinPart[]) {
    super(baseKlass, children);
  }

  get table(): string {
    return this.baseKlass.tableName;
  }

  isMatch(other: JoinPart): boolean {
    if (this === other) return true;
    return super.isMatch(other) && this.baseKlass === other.baseKlass;
  }
}
