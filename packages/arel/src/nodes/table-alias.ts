import { Node } from "./node.js";
import { Binary } from "./binary.js";
import { Cte } from "./cte.js";
import { SqlLiteral } from "./sql-literal.js";
import { Attribute } from "../attributes/attribute.js";
import { Table } from "../table.js";

interface TypeCastable {
  name?: string;
  typeCastForDatabase(attrName: string | Node | null, value: unknown): unknown;
  typeForAttribute(name: string | Node | null): unknown;
  isAbleToTypeCast?: () => boolean;
}

export class TableAlias extends Binary {
  constructor(relation: Node | Table, name: string | SqlLiteral) {
    super(relation, name);
  }

  get name(): string | SqlLiteral {
    return this.right as string | SqlLiteral;
  }

  set name(value: string | SqlLiteral) {
    this.right = value;
  }

  get relation(): Node {
    return this.left as Node;
  }

  set relation(value: Node) {
    this.left = value;
  }

  get tableAlias(): string | SqlLiteral {
    return this.name;
  }

  get tableName(): string {
    const rel = this.relation as unknown as TypeCastable;
    return typeof rel?.name === "string" ? rel.name : this.nameString;
  }

  typeCastForDatabase(attrName: string | Node | null, value: unknown): unknown {
    return (this.relation as unknown as TypeCastable).typeCastForDatabase(attrName, value);
  }

  typeForAttribute(name: string | Node | null): unknown {
    return (this.relation as unknown as TypeCastable).typeForAttribute(name);
  }

  isAbleToTypeCast(): boolean {
    const rel = this.relation as unknown as TypeCastable;
    return typeof rel?.isAbleToTypeCast === "function" ? rel.isAbleToTypeCast() : false;
  }

  toCte(): Cte {
    return new Cte(this.name, this.relation);
  }

  private get nameString(): string {
    return this.name instanceof SqlLiteral ? this.name.value : this.name;
  }

  get(name: string): Attribute {
    return this.relation instanceof Table
      ? this.relation.get(name, this)
      : new Attribute(this, name);
  }
}
