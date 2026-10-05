import { hasKey } from "@blazetrails/ruby-compat";
import { Table } from "@blazetrails/arel";
import { singularize } from "@blazetrails/activesupport";
import type { Base } from "./base.js";
import { PredicateBuilder } from "./relation/predicate-builder.js";
import { Connection as TypeCasterConnection } from "./type-caster/connection.js";

export class TableMetadata {
  private _klass: typeof Base | null;
  private _arelTable: Table | any;
  private _reflection: any;

  constructor(klass: typeof Base | null, arelTable: Table | any, reflection?: any) {
    this._klass = klass;
    this._arelTable = arelTable;
    this._reflection = reflection ?? null;
  }

  get primaryKey(): string | string[] | null {
    return this._klass?.primaryKey ?? null;
  }

  type(columnName: string): any {
    return this._arelTable.typeForAttribute(columnName);
  }

  hasColumn(columnName: string): boolean | null {
    const columnsHash = this.klass?.columnsHash();
    return columnsHash == null ? null : hasKey(columnsHash, columnName);
  }

  isAssociatedWith(tableName: string): any {
    return this.klass == null ? null : this.klass._reflectOnAssociation(tableName);
  }

  associatedTable(
    tableName: string,
    fallback?: (name: string) => typeof Base | null,
  ): TableMetadata {
    const reflection: any =
      this.klass!._reflectOnAssociation(tableName) ??
      this.klass!._reflectOnAssociation(singularize(tableName));

    if (!reflection && tableName === this._arelTable.name) {
      return this;
    }

    let associationKlass: typeof Base | null = null;
    if (reflection) {
      if (!reflection.isPolymorphic?.()) {
        associationKlass = reflection.klass;
      }
    } else if (fallback) {
      associationKlass = fallback(tableName);
    }

    if (associationKlass) {
      let arelTable = (associationKlass as any).arelTable;
      if (arelTable.name !== tableName) arelTable = arelTable.alias(tableName);
      return new TableMetadata(associationKlass, arelTable, reflection);
    } else {
      const typeCaster = new TypeCasterConnection(this.klass as any, tableName);
      const arelTable = new Table(tableName, { typeCaster });
      return new TableMetadata(null, arelTable, reflection);
    }
  }

  isPolymorphicAssociation(): boolean {
    return !!this._reflection?.isPolymorphic?.();
  }

  get polymorphicNameAssociation(): string | null {
    return this._reflection?.polymorphicName?.() ?? null;
  }

  isThroughAssociation(): boolean {
    return !!this._reflection?.isThroughReflection?.();
  }

  reflectOnAggregation(aggregationName: string): any {
    return this._klass?.reflectOnAggregation(aggregationName) ?? null;
  }

  aggregatedWith(aggregationName: string): any {
    return this.reflectOnAggregation(aggregationName);
  }

  get predicateBuilder(): PredicateBuilder {
    if (this.klass) {
      return this.klass.predicateBuilder.with(this);
    } else {
      return new PredicateBuilder(this);
    }
  }

  get arelTable(): Table | any {
    return this._arelTable;
  }

  /** @internal */
  get klass(): typeof Base | null {
    return this._klass;
  }

  /** @internal */
  get reflection(): any {
    return this._reflection;
  }

  joinPrimaryKey(klass?: typeof Base): string | string[] | null {
    return this._reflection?.joinPrimaryKey(klass) ?? null;
  }

  get joinPrimaryType(): string | null {
    return this._reflection?.joinPrimaryType ?? null;
  }

  get joinForeignKey(): string | string[] | null {
    return this._reflection?.joinForeignKey ?? null;
  }

  get joinForeignType(): string | null {
    return this._reflection?.joinForeignType ?? null;
  }
}
