import { Node, NodeVisitor } from "./node.js";
import { Binary } from "./binary.js";
import { Cte } from "./cte.js";
import { SqlLiteral } from "./sql-literal.js";
import { Attribute } from "../attributes/attribute.js";

/** Structural view of `TableAlias#relation`. `typeCastForDatabase` /
 *  `typeForAttribute` are required because Rails delegates to them bare
 *  (table_alias.rb:18-24); `isAbleToTypeCast` stays optional because
 *  table_alias.rb:26-28 is `respond_to?`-guarded — a relation may be a
 *  `SelectManager`, which has no such method. */
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

  get(columnName: string): Attribute {
    // Resolve attribute aliases through the underlying relation's klass, the
    // same way Table#get does, so `where("clients.new_name": …)` against a
    // self-join alias still maps `new_name` to the real column.
    const klass = (this.relation as { klass?: { _attributeAliases?: Record<string, string> } })
      ?.klass;
    const resolved = klass?._attributeAliases?.[columnName] ?? columnName;
    return new Attribute(this, resolved);
  }

  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}
