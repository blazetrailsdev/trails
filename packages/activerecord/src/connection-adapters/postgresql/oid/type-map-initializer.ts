/**
 * PostgreSQL type map initializer — populates a type map from pg_type rows.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::OID::TypeMapInitializer
 */

export interface TypeMap {
  registerType(oid: number, type: unknown): void;
  aliasType(oid: number, targetOid: number): void;
}

export interface PgTypeRow {
  oid: number;
  typname: string;
  typelem: number;
  typdelim: string;
  typtype: string;
  typbasetype: number;
  typarray: number;
}

export class TypeMapInitializer {
  private store: TypeMap;

  constructor(store: TypeMap) {
    this.store = store;
  }

  runInitializer(records: PgTypeRow[]): void {
    for (const row of records) {
      if (row.typtype === "b") {
        this.registerBaseType(row);
      } else if (row.typtype === "r") {
        this.registerRangeType(row);
      } else if (row.typtype === "e") {
        this.registerEnumType(row);
      } else if (row.typtype === "d") {
        this.registerDomainType(row);
      } else if (row.typtype === "c") {
        this.registerCompositeType(row);
      }
    }

    for (const row of records) {
      if (row.typarray && row.typarray > 0) {
        this.registerArrayType(row);
      }
    }
  }

  private registerBaseType(row: PgTypeRow): void {
    this.store.registerType(row.oid, { name: row.typname });
  }

  private registerRangeType(row: PgTypeRow): void {
    this.store.registerType(row.oid, { name: row.typname, range: true });
  }

  private registerEnumType(row: PgTypeRow): void {
    this.store.registerType(row.oid, { name: row.typname, enum: true });
  }

  private registerDomainType(row: PgTypeRow): void {
    if (row.typbasetype > 0) {
      this.store.aliasType(row.oid, row.typbasetype);
    }
  }

  private registerCompositeType(row: PgTypeRow): void {
    this.store.registerType(row.oid, { name: row.typname, composite: true });
  }

  private registerArrayType(row: PgTypeRow): void {
    this.store.registerType(row.typarray, {
      name: row.typname,
      array: true,
      elementOid: row.oid,
      delimiter: row.typdelim,
    });
  }
}
