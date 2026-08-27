import { rbEqual, rbHash } from "@blazetrails/activesupport";
import { Node } from "./node.js";
import { Binary } from "./binary.js";
import { SqlLiteral } from "./sql-literal.js";
import { Table } from "../table.js";
import type { SelectManager } from "../select-manager.js";

export class Cte extends Binary {
  get name(): string | SqlLiteral {
    return this.left as string | SqlLiteral;
  }

  set name(value: string | SqlLiteral) {
    this.left = value;
  }

  get relation(): Node | SelectManager {
    return this.right as Node | SelectManager;
  }

  set relation(value: Node | SelectManager) {
    this.right = value;
  }

  readonly materialized: boolean | null;

  constructor(
    name: string | SqlLiteral,
    relation: Node | Table | SelectManager,
    materialized: boolean | null = null,
  ) {
    super(name, relation);
    this.materialized = materialized;
  }

  override hash(): number {
    return rbHash([this.name, this.relation, this.materialized]);
  }

  override eql(other: unknown): boolean {
    return (
      other instanceof Cte &&
      this.constructor === other.constructor &&
      rbEqual(this.name, other.name) &&
      rbEqual(this.relation, other.relation) &&
      rbEqual(this.materialized, other.materialized)
    );
  }

  toCte(): Cte {
    return this;
  }

  toTable(): Table {
    return new Table(this.name as unknown as string);
  }
}
