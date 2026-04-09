/**
 * Wraps a model class and its arel table to provide metadata for
 * query building — column lookups, association traversal, and
 * predicate builder access.
 *
 * Mirrors: ActiveRecord::TableMetadata
 */
import { Table } from "@blazetrails/arel";
import { singularize } from "@blazetrails/activesupport";
import type { Base } from "./base.js";
import { reflectOnAssociation, reflectOnAggregation } from "./reflection.js";
import { PredicateBuilder } from "./relation/predicate-builder.js";
import { Connection as TypeCasterConnection } from "./type-caster/connection.js";
import { columnsHash } from "./model-schema.js";

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

  hasColumn(columnName: string): boolean {
    if (!this._klass) return false;
    const hash = columnsHash(this._klass);
    return columnName in hash;
  }

  isAssociatedWith(tableName: string): any {
    if (!this._klass) return null;
    return reflectOnAssociation(this._klass, tableName);
  }

  associatedTable(
    tableName: string,
    fallback?: (name: string) => typeof Base | null,
  ): TableMetadata {
    const reflection = this._klass
      ? (reflectOnAssociation(this._klass, tableName) ??
        reflectOnAssociation(this._klass, singularize(tableName)))
      : null;

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
      if (arelTable && arelTable.name !== tableName) {
        arelTable = arelTable.alias(tableName);
      }
      return new TableMetadata(associationKlass, arelTable, reflection);
    }

    const typeCaster = new TypeCasterConnection(this._klass as any, tableName);
    const arelTable = new Table(tableName, { typeCaster });
    return new TableMetadata(null, arelTable, reflection);
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
    if (!this._klass) return null;
    return reflectOnAggregation(this._klass, aggregationName);
  }

  aggregatedWith(aggregationName: string): any {
    return this.reflectOnAggregation(aggregationName);
  }

  get predicateBuilder(): PredicateBuilder {
    if (this._klass) {
      const klass = this._klass as any;
      const pb =
        klass._predicateBuilder ??
        (typeof klass.predicateBuilder === "function"
          ? klass.predicateBuilder()
          : klass.predicateBuilder);
      if (pb && typeof pb.with === "function") {
        return pb.with(this);
      }
    }
    return new PredicateBuilder(this._arelTable);
  }

  get arelTable(): Table | any {
    return this._arelTable;
  }

  get joinPrimaryKey(): string | string[] | null {
    return this._reflection?.joinPrimaryKey ?? null;
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
