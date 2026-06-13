import { Node, NodeVisitor } from "./node.js";
import { Binary } from "./binary.js";
import { Cte } from "./cte.js";
import { SqlLiteral } from "./sql-literal.js";
import { Attribute } from "../attributes/attribute.js";

interface TypeCastable {
  name?: string;
  typeCastForDatabase?: (attrName: string, value: unknown) => unknown;
  typeForAttribute?: (name: string) => unknown;
  isAbleToTypeCast?: () => boolean;
}

export class TableAlias extends Binary {
  readonly relation: Node;
  // Rails: `SelectManager#as` stores the alias as a `Nodes::SqlLiteral` (rendered
  // bare), while `Table#alias` stores a plain string (quoted). Accept both.
  readonly name: string | SqlLiteral;

  constructor(relation: Node, name: string | SqlLiteral) {
    super(relation, name);
    this.relation = relation;
    this.name = name;
  }

  get tableName(): string {
    const rel = this.relation as TypeCastable;
    return typeof rel?.name === "string" ? rel.name : this.nameString;
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
    return new Cte(this.nameString, this.relation);
  }

  /** The alias as a bare string, unwrapping a `SqlLiteral` name. */
  private get nameString(): string {
    return this.name instanceof SqlLiteral ? this.name.value : this.name;
  }

  get(columnName: string): Attribute {
    return new Attribute(this, columnName);
  }

  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}
