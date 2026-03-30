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
  constructor(baseKlass: typeof Base) {
    super(baseKlass);
  }

  get table(): string {
    return this.baseKlass.tableName;
  }

  isMatch(otherKlass: typeof Base): boolean {
    return this.baseKlass === otherKlass;
  }
}
