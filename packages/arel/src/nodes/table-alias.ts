import { Node, NodeVisitor } from "./node.js";
import { Binary } from "./binary.js";
import { Cte } from "./cte.js";
import { SqlLiteral } from "./sql-literal.js";
import { Attribute } from "../attributes/attribute.js";
// Cyclic with table.ts (which imports TableAlias); safe because the binding is
// only dereferenced inside `get()`, never at class-evaluation time.
import { Table } from "../table.js";

/** Structural view of `TableAlias#relation`.
 *
 *  Optionality here mirrors Rails' *guards*, not what the relation actually
 *  responds to — a `SelectManager` relation has none of these three members.
 *  `isAbleToTypeCast` is optional because table_alias.rb:26-28 guards it with
 *  `respond_to?`; the other two are required because table_alias.rb:18-24
 *  delegates to them bare, so a relation lacking them raises — Ruby's
 *  `NoMethodError`. The cast makes this unenforced either way; it documents
 *  which calls Rails protects. */
interface TypeCastable {
  name?: string;
  typeCastForDatabase(attrName: string, value: unknown): unknown;
  typeForAttribute(name: string): unknown;
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

  // Mirrors Rails `alias :table_alias :name` (table_alias.rb).
  get tableAlias(): string | SqlLiteral {
    return this.name;
  }

  get tableName(): string {
    const rel = this.relation as unknown as TypeCastable;
    return typeof rel?.name === "string" ? rel.name : this.nameString;
  }

  typeCastForDatabase(attrName: string, value: unknown): unknown {
    return (this.relation as unknown as TypeCastable).typeCastForDatabase(attrName, value);
  }

  typeForAttribute(name: string): unknown {
    return (this.relation as unknown as TypeCastable).typeForAttribute(name);
  }

  isAbleToTypeCast(): boolean {
    const rel = this.relation as unknown as TypeCastable;
    return typeof rel?.isAbleToTypeCast === "function" ? rel.isAbleToTypeCast() : false;
  }

  toCte(): Cte {
    return new Cte(this.nameString, this.relation);
  }

  /** The alias as a bare string, unwrapping a `SqlLiteral` name. */
  private get nameString(): string {
    return this.name instanceof SqlLiteral ? this.name.value : this.name;
  }

  get(name: string): Attribute {
    return this.relation instanceof Table
      ? this.relation.get(name, this)
      : new Attribute(this, name);
  }

  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}
