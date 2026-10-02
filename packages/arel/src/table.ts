import { rbEqual, rbHash } from "@blazetrails/activesupport";
import { Attribute } from "./attributes/attribute.js";
import { EmptyJoinError } from "./errors.js";
import { _engine, ArelEngine, Node } from "./nodes/node.js";
import { Arel } from "./namespaces.js";
import { SelectManager } from "./select-manager.js";
import { InnerJoin } from "./nodes/inner-join.js";
import { OuterJoin } from "./nodes/outer-join.js";
import { SqlLiteral } from "./nodes/sql-literal.js";
import { StringJoin } from "./nodes/string-join.js";
import type { Join } from "./nodes/binary.js";
import { TableAlias } from "./nodes/table-alias.js";
import { isEmpty, isSymbol, rbModConstSet, symbolToS } from "@blazetrails/ruby-compat";

export interface TableKlass {
  readonly attributeAliases: Record<string, string>;
  /** @internal */
  typeCaster(): unknown;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Table {
  static get engine(): ArelEngine | null {
    return _engine.current;
  }

  static set engine(value: ArelEngine | null) {
    _engine.current = value;
  }

  name: string | Node;
  readonly tableAlias: string | null;
  private readonly klass: TableKlass | null;

  constructor(
    name: string | Node,
    {
      as = null,
      klass = null,
      typeCaster = klass?.typeCaster() ?? null,
    }: { as?: string | null; klass?: TableKlass | null; typeCaster?: unknown } = {},
  ) {
    if (isSymbol(name)) name = symbolToS(name);

    this.name = name;
    this.klass = klass;
    this.typeCaster = typeCaster as Table["typeCaster"];

    if ((isSymbol(as) ? symbolToS(as) : as) === this.name) {
      as = null;
    }
    this.tableAlias = as;
  }

  alias(name?: string): TableAlias {
    return new TableAlias(this, name ?? `${this.name}_2`);
  }

  from(): SelectManager {
    return new SelectManager(this);
  }

  join(
    relation: Node | Table | string | null | undefined,
    klass: new (left: Node | Table, right: Node | null) => Join = InnerJoin,
  ): SelectManager {
    if (relation == null) return this.from();

    if (typeof relation === "string" || relation instanceof SqlLiteral) {
      if (isEmpty(relation)) throw new EmptyJoinError();
      klass = StringJoin as unknown as new (left: Node | Table, right: Node | null) => Join;
    }

    return this.from().join(relation, klass);
  }

  outerJoin(relation: Node | Table | string): SelectManager {
    return this.join(relation, OuterJoin);
  }

  group(...columns: (Node | string)[]): SelectManager {
    return this.from().group(...columns);
  }

  order(...expr: (Node | string)[]): SelectManager {
    return this.from().order(...expr);
  }

  where(condition: Node): SelectManager {
    return this.from().where(condition);
  }

  project(...things: (Node | string)[]): SelectManager {
    return this.from().project(...things);
  }

  take(amount: number): SelectManager {
    return this.from().take(amount);
  }

  skip(amount: number): SelectManager {
    return this.from().skip(amount);
  }

  having(expr: Node): SelectManager {
    return this.from().having(expr);
  }

  get(name: Node | string | null, table: Attribute["relation"] = this): Attribute {
    if (isSymbol(name)) name = symbolToS(name);
    if (this.klass != null) {
      const attributeAliases = this.klass.attributeAliases;
      name =
        (Object.hasOwn(attributeAliases, name as string) && attributeAliases[name as string]) ||
        name;
    }
    return new Attribute(table, name);
  }

  hash(): number {
    return rbHash(this.name);
  }

  eql(other: unknown): boolean {
    return (
      other instanceof Table &&
      this.constructor === other.constructor &&
      rbEqual(this.name, other.name) &&
      rbEqual(this.tableAlias, other.tableAlias)
    );
  }

  typeCastForDatabase(attrName: string | Node | null, value: unknown): unknown {
    return this.typeCaster!.typeCastForDatabase(attrName, value);
  }

  private readonly typeCaster: {
    typeCastForDatabase(attrName: string | Node | null, value: unknown): unknown;
    typeForAttribute(name: string | Node | null): unknown;
  } | null;

  typeForAttribute(name: string | Node | null): unknown {
    return this.typeCaster!.typeForAttribute(name);
  }

  isAbleToTypeCast(): boolean {
    return this.typeCaster != null;
  }
}

type _FactoryMethodsModule = import("./factory-methods.js").FactoryMethodsModule;
type _AliasPredication = import("./alias-predication.js").AliasPredicationModule;

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging */
export interface Table extends _FactoryMethodsModule, _AliasPredication {}

rbModConstSet(Arel, "Table", Table);
