/**
 * PostgreSQL type map initializer — populates a type map from pg_type rows.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::OID::TypeMapInitializer
 */

import { ArgumentError, type Type } from "@blazetrails/activemodel";

import { HashLookupTypeMap } from "../../../type/hash-lookup-type-map.js";
import { Array as OidArray } from "./array.js";
import { Enum } from "./enum.js";
import { RangeType, type RangeSubtype } from "./range.js";
import { Vector } from "./vector.js";

export interface PgTypeRow {
  oid: number | string;
  typname: string;
  typelem: number | string;
  typdelim: string;
  typtype: string;
  typbasetype: number | string;
  /**
   * typarray is a column on pg_type but Rails' load_types_queries
   * doesn't SELECT it and TypeMapInitializer doesn't read it. Keep it
   * optional so PgTypeRow matches the adapter-fetched row shape
   * (otherwise callers get a silent `undefined` at runtime).
   */
  typarray?: number | string;
  typinput?: string;
  rngsubtype?: number | string;
}

export class TypeMapInitializer {
  private store: HashLookupTypeMap;

  constructor(store: HashLookupTypeMap) {
    this.store = store;
  }

  run(records: PgTypeRow[]): void {
    const nodes = records.filter((row) => !this.store.isKey(toInt(row.oid)));
    const mapped = extract(nodes, (row) => this.store.isKey(row.typname));
    const ranges = extract(nodes, (row) => row.typtype === "r");
    const enums = extract(nodes, (row) => row.typtype === "e");
    const domains = extract(nodes, (row) => row.typtype === "d");
    const arrays = extract(nodes, (row) => row.typinput === "array_in");
    const composites = extract(nodes, (row) => toInt(row.typelem) !== 0);

    mapped.forEach((row) => this.registerMappedType(row));
    enums.forEach((row) => this.registerEnumType(row));
    domains.forEach((row) => this.registerDomainType(row));
    arrays.forEach((row) => this.registerArrayType(row));
    ranges.forEach((row) => this.registerRangeType(row));
    composites.forEach((row) => this.registerCompositeType(row));
  }

  runInitializer(records: PgTypeRow[]): void {
    this.run(records);
  }

  queryConditionsForKnownTypeNames(): string {
    // Divergence: Rails interpolates type names unescaped (they're internal
    // keys, not user input). We single-quote-escape defensively since the
    // output is still SQL and the cost is negligible.
    const knownTypeNames = this.store.keys().map((key) => `'${String(key).replace(/'/g, "''")}'`);
    return `WHERE\n  t.typname IN (${knownTypeNames.join(", ")})\n`;
  }

  queryConditionsForKnownTypeTypes(): string {
    return "WHERE\n  t.typtype IN ('r', 'e', 'd')\n";
  }

  queryConditionsForArrayTypes(): string {
    const knownTypeOids = this.store.keys().filter((key) => typeof key !== "string");
    // Divergence: Rails emits `t.typelem IN ()` for an empty OID set, which
    // is invalid SQL. We short-circuit to `WHERE 1=0` to return zero rows
    // instead of erroring.
    if (knownTypeOids.length === 0) return "WHERE\n  1=0\n";
    return `WHERE\n  t.typelem IN (${knownTypeOids.join(", ")})\n`;
  }

  private registerMappedType(row: PgTypeRow): void {
    this.aliasType(row.oid, row.typname);
  }

  private registerRangeType(row: PgTypeRow): void {
    this.registerWithSubtype(
      row.oid,
      toInt(row.rngsubtype ?? 0),
      // Rails' OID::Range#type_cast_single calls @subtype.deserialize. If the
      // registered subtype doesn't implement deserialize, Ruby would raise
      // NoMethodError at cast time; we preserve that failure mode rather than
      // silently routing through cast.
      (subtype) => new RangeType(subtype as unknown as RangeSubtype, row.typname),
    );
  }

  private registerEnumType(row: PgTypeRow): void {
    this.register(row.oid, new Enum());
  }

  private registerDomainType(row: PgTypeRow): void {
    const baseType = this.store.lookup(toInt(row.typbasetype));
    if (baseType) {
      this.register(row.oid, baseType);
    } else {
      console.warn(`unknown base type (OID: ${row.typbasetype}) for domain ${row.typname}.`);
    }
  }

  private registerCompositeType(row: PgTypeRow): void {
    const subtype = this.store.lookup(toInt(row.typelem));
    if (subtype) this.register(row.oid, new Vector(row.typdelim, subtype));
  }

  private registerArrayType(row: PgTypeRow): void {
    // Skip-on-miss via registerWithSubtype, mirroring Rails' register_array_type.
    // The eager full load run by configureConnection aliases every scalar OID
    // (its by-typname pass) before this array pass, so the element type is in
    // the store and the array never falls through to a ValueType.
    this.registerWithSubtype(
      row.oid,
      toInt(row.typelem),
      (subtype) => new OidArray(subtype, row.typdelim),
    );
  }

  private register(
    oid: number | string,
    oidType: Type | ((oid: number | string, ...args: unknown[]) => Type),
  ): void {
    oid = this.assertValidRegistration(oid, oidType);
    if (typeof oidType === "function") {
      this.store.registerType(oid, undefined, oidType);
    } else {
      this.store.registerType(oid, oidType);
    }
  }

  private aliasType(oid: number | string, target: number | string): void {
    oid = this.assertValidRegistration(oid, target);
    this.store.aliasType(oid, target);
  }

  private registerWithSubtype(
    oid: number | string,
    targetOid: number,
    block: (subtype: OidSubtype) => Type,
  ): void {
    if (this.store.isKey(targetOid)) {
      this.register(oid, (_oid: number | string, ...args: unknown[]) =>
        block(this.store.lookup(targetOid, ...args) as OidSubtype),
      );
    }
  }

  private assertValidRegistration(oid: number | string, oidType: unknown): number {
    if (oidType == null) throw new ArgumentError(`can't register nil type for OID ${oid}`);
    return toInt(oid);
  }
}

function extract<T>(values: T[], predicate: (value: T) => boolean): T[] {
  const extracted: T[] = [];
  for (let i = values.length - 1; i >= 0; i--) {
    if (predicate(values[i])) {
      extracted.unshift(values[i]);
      values.splice(i, 1);
    }
  }
  return extracted;
}

interface OidSubtype {
  cast(value: unknown): unknown;
  serialize(value: unknown): unknown;
  deserialize?(value: unknown): unknown;
}

function toInt(value: number | string): number {
  // Mirrors Ruby's String#to_i: non-numeric strings coerce to 0 rather than NaN.
  if (typeof value === "number") return Number.isFinite(value) ? Math.trunc(value) : 0;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}
