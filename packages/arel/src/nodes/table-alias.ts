import { Node, NodeVisitor } from "./node.js";
import { Cte } from "./cte.js";
import { Attribute } from "../attributes/attribute.js";

interface TypeCastable {
  name?: string;
  typeCastForDatabase?: (attrName: string, value: unknown) => unknown;
  typeForAttribute?: (name: string) => unknown;
  isAbleToTypeCast?: () => boolean;
}

export class TableAlias extends Node {
  readonly relation: Node;
  readonly name: string;

  constructor(relation: Node, name: string) {
    super();
    this.relation = relation;
    this.name = name;
  }

  get(columnName: string): Attribute {
    return new Attribute(this, columnName);
  }

  get tableName(): string {
    const rel = this.relation as TypeCastable;
    return typeof rel?.name === "string" ? rel.name : this.name;
  }

  typeCastForDatabase(attrName: string, value: unknown): unknown {
    const rel = this.relation as TypeCastable;
    return rel?.typeCastForDatabase ? rel.typeCastForDatabase(attrName, value) : value;
  }

  typeForAttribute(name: string): unknown {
    const rel = this.relation as TypeCastable;
    return rel?.typeForAttribute ? rel.typeForAttribute(name) : undefined;
  }

  isAbleToTypeCast(): boolean {
    const rel = this.relation as TypeCastable;
    return typeof rel?.isAbleToTypeCast === "function" ? rel.isAbleToTypeCast() : false;
  }

  toCte(): Cte {
    return new Cte(this.name, this.relation);
  }

  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}
