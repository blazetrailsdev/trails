import { include, rbEqual, rbHash } from "@blazetrails/activesupport";
import { Attribute } from "./attributes/attribute.js";
import { EmptyJoinError } from "./errors.js";
import { _engine, ArelEngine } from "./nodes/node.js";
import { Arel } from "./namespaces.js";
import { SelectManager } from "./select-manager.js";
import { InnerJoin } from "./nodes/inner-join.js";
import { OuterJoin } from "./nodes/outer-join.js";
import { SqlLiteral } from "./nodes/sql-literal.js";
import { StringJoin } from "./nodes/string-join.js";
import type { Join } from "./nodes/binary.js";
import { TableAlias } from "./nodes/table-alias.js";
import {
  isEmpty,
  isSymbol,
  rbModConstSet,
  rbObjAsString,
  symbolToS,
} from "@blazetrails/ruby-compat";
import { FactoryMethods, type FactoryMethodsModule } from "./factory-methods.js";
import { AliasPredication, type AliasPredicationModule } from "./alias-predication.js";
import type { ArelNode } from "./arel.js";

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

  name: string | ArelNode;
  readonly tableAlias: string | null;
  private readonly klass: TableKlass | null;

  constructor(
    name: string | ArelNode,
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

    if (rbObjAsString(as) === this.name) {
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
    relation: ArelNode | Table | string | null | undefined,
    klass: new (left: ArelNode | Table, right: ArelNode | null) => Join = InnerJoin,
  ): SelectManager {
    if (relation == null) return this.from();

    if (typeof relation === "string" || relation instanceof SqlLiteral) {
      if (isEmpty(relation)) throw new EmptyJoinError();
      klass = StringJoin;
    }

    return this.from().join(relation, klass);
  }

  outerJoin(relation: ArelNode | Table | string): SelectManager {
    return this.join(relation, OuterJoin);
  }

  group(...columns: (ArelNode | string)[]): SelectManager {
    return this.from().group(...columns);
  }

  order(...expr: (ArelNode | string)[]): SelectManager {
    return this.from().order(...expr);
  }

  where(condition: ArelNode): SelectManager {
    return this.from().where(condition);
  }

  project(...things: (ArelNode | string)[]): SelectManager {
    return this.from().project(...things);
  }

  take(amount: number): SelectManager {
    return this.from().take(amount);
  }

  skip(amount: number): SelectManager {
    return this.from().skip(amount);
  }

  having(expr: ArelNode): SelectManager {
    return this.from().having(expr);
  }

  get(name: ArelNode | string | null, table: Attribute["relation"] = this): Attribute {
    if (isSymbol(name)) name = symbolToS(name);
    if (this.klass != null) {
      name =
        (Object.getOwnPropertyDescriptor(this.klass.attributeAliases, name as string)?.value as
          | string
          | undefined) ?? name;
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

  typeCastForDatabase(attrName: string | ArelNode | null, value: unknown): unknown {
    return this.typeCaster!.typeCastForDatabase(attrName, value);
  }

  private readonly typeCaster: {
    typeCastForDatabase(attrName: string | ArelNode | null, value: unknown): unknown;
    typeForAttribute(name: string | ArelNode | null): unknown;
  } | null;

  typeForAttribute(name: string | ArelNode | null): unknown {
    return this.typeCaster!.typeForAttribute(name);
  }

  isAbleToTypeCast(): boolean {
    return this.typeCaster != null;
  }
}

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging */
export interface Table extends FactoryMethodsModule, AliasPredicationModule {}

include(Table, FactoryMethods);
include(Table, AliasPredication);

rbModConstSet(Arel, "Table", Table);
