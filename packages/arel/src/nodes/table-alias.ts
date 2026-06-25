import { Node, NodeVisitor } from "./node.js";
import { Binary } from "./binary.js";
import { Cte } from "./cte.js";
import { SqlLiteral } from "./sql-literal.js";
import { Attribute } from "../attributes/attribute.js";
import { SelectManager as SelectManagerCtor } from "../select-manager.js";

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

  // Mirrors Rails `alias :table_alias :name` (table_alias.rb).
  get tableAlias(): string | SqlLiteral {
    return this.name;
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

  // Mirrors Arel::Table#star — projects every column of the aliased relation
  // (`omg_developers.*`). The `"*"` sentinel skips column-name quoting in the
  // visitor, exactly as on a plain Table.
  get star(): Attribute {
    return new Attribute(this, "*");
  }

  // Mirrors Arel::Table#project: an aliased table can seed a SelectManager whose
  // FROM is the alias (`developers omg_developers`), so a `Relation` built on a
  // table alias threads that alias through projections, FROM, and ORDER BY.
  project(...projections: (Node | string)[]): SelectManagerCtor {
    const manager = new SelectManagerCtor(this as unknown as never);
    if (projections.length > 0) {
      manager.project(...projections);
    }
    return manager;
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
