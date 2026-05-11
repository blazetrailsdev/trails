/**
 * PostgreSQL type map initializer — populates a type map from pg_type rows.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::OID::TypeMapInitializer
 */

import { Array as OidArray } from "./array.js";
import { Enum } from "./enum.js";
import { RangeType, MultiRangeType, type RangeSubtype } from "./range.js";
import { Vector } from "./vector.js";

export interface TypeMap {
  registerType(
    oid: number | string,
    type: unknown | ((oid: number | string, ...args: unknown[]) => unknown),
  ): void;
  /** @internal */
  aliasType(oid: number | string, targetOid: number | string): void;
  lookup?(oid: number | string, ...args: unknown[]): unknown;
  has?(oid: number | string): boolean;
  keys?(): Array<number | string>;
}

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
  private store: TypeMap;
  /** Multirange rows whose range OID was not yet in the store during run(). */
  readonly deferredMultirangeOids: number[] = [];
  private deferredMultirangeRows: PgTypeRow[] = [];

  constructor(store: TypeMap) {
    this.store = store;
  }

  /** Re-attempt registration for any multirange rows deferred during run(). */
  retryDeferredMultiranges(): void {
    if (this.deferredMultirangeRows.length === 0) return;
    const rows = this.deferredMultirangeRows;
    this.deferredMultirangeRows = [];
    this.deferredMultirangeOids.length = 0;
    rows.forEach((row) => this.registerMultirangeType(row));
  }

  run(records: PgTypeRow[]): void {
    const nodes = records.filter((row) => !this.storeHas(toInt(row.oid)));
    const mapped = extract(nodes, (row) => this.storeHas(row.typname));
    const ranges = extract(nodes, (row) => row.typtype === "r");
    const multiranges = extract(nodes, (row) => row.typtype === "m");
    const enums = extract(nodes, (row) => row.typtype === "e");
    const domains = extract(nodes, (row) => row.typtype === "d");
    const arrays = extract(nodes, (row) => row.typinput === "array_in");
    const composites = extract(nodes, (row) => toInt(row.typelem) !== 0);

    mapped.forEach((row) => this.registerMappedType(row));
    enums.forEach((row) => this.registerEnumType(row));
    domains.forEach((row) => this.registerDomainType(row));
    arrays.forEach((row) => this.registerArrayType(row));
    ranges.forEach((row) => this.registerRangeType(row));
    multiranges.forEach((row) => this.registerMultirangeType(row));
    composites.forEach((row) => this.registerCompositeType(row));
  }

  runInitializer(records: PgTypeRow[]): void {
    this.run(records);
  }

  queryConditionsForKnownTypeNames(): string {
    // Divergence: Rails interpolates type names unescaped (they're internal
    // keys, not user input). We single-quote-escape defensively since the
    // output is still SQL and the cost is negligible.
    const knownTypeNames = this.storeKeys().map((key) => `'${String(key).replace(/'/g, "''")}'`);
    return `WHERE\n  t.typname IN (${knownTypeNames.join(", ")})\n`;
  }

  queryConditionsForKnownTypeTypes(): string {
    return "WHERE\n  t.typtype IN ('r', 'e', 'd', 'm')\n";
  }

  queryConditionsForArrayTypes(): string {
    const knownTypeOids = this.storeKeys().filter((key) => typeof key !== "string");
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

  private registerMultirangeType(row: PgTypeRow): void {
    // Real PG 14+ has typelem=0 for multirange rows in pg_type — the range
    // OID is not stored there. Synthetic test rows may supply a non-zero
    // typelem for convenience, and that fast path still works. When typelem=0
    // (the real-PG case), fall back to iterating the type map for a RangeType
    // whose typname matches the naming convention ("int4multirange" → "int4range").
    if (!this.store.lookup) {
      throw new Error(
        `TypeMap store must implement lookup() to register subtype-based OID ${row.oid}`,
      );
    }
    let rangeOid = toInt(row.typelem ?? 0);
    if (rangeOid === 0) {
      const rangeName = row.typname.replace("multirange", "range");
      for (const key of this.storeKeys()) {
        if (typeof key === "number") {
          const candidate = this.storeLookup(key);
          if (candidate instanceof RangeType && candidate.name === rangeName) {
            rangeOid = key;
            break;
          }
        }
      }
    }
    if (rangeOid !== 0 && this.storeHas(rangeOid)) {
      this.register(row.oid, (_oid: number | string, ...args: unknown[]) => {
        const rangeType = this.storeLookup(rangeOid, ...args);
        const subtype =
          rangeType instanceof RangeType
            ? rangeType.subtype
            : (rangeType as unknown as RangeSubtype);
        return new MultiRangeType(subtype, row.typname);
      });
    } else if (rangeOid !== 0) {
      // Range OID found but not yet registered — defer so adapter can load it.
      this.deferredMultirangeOids.push(rangeOid);
      this.deferredMultirangeRows.push(row);
    }
    // rangeOid still 0 means range type not in store yet; skip silently.
    // The adapter's loadAdditionalTypes will retry via columns() batch-load.
  }

  private registerEnumType(row: PgTypeRow): void {
    this.register(row.oid, new Enum());
  }

  private registerDomainType(row: PgTypeRow): void {
    const baseType = this.storeLookup(toInt(row.typbasetype));
    if (baseType) {
      this.register(row.oid, baseType);
    } else {
      console.warn(`unknown base type (OID: ${row.typbasetype}) for domain ${row.typname}.`);
    }
  }

  private registerCompositeType(row: PgTypeRow): void {
    const subtype = this.storeLookup(toInt(row.typelem));
    if (subtype) this.register(row.oid, new Vector(row.typdelim, subtype));
  }

  private registerArrayType(row: PgTypeRow): void {
    this.registerWithSubtype(
      row.oid,
      toInt(row.typelem),
      (subtype) => new OidArray(subtype, row.typdelim),
    );
  }

  private register(
    oid: number | string,
    oidType: unknown | ((oid: number | string, ...args: unknown[]) => unknown),
  ): void {
    this.store.registerType(this.assertValidRegistration(oid, oidType), oidType);
  }

  private aliasType(oid: number | string, target: number | string): void {
    this.store.aliasType(this.assertValidRegistration(oid, target), target);
  }

  private registerWithSubtype(
    oid: number | string,
    targetOid: number,
    build: (subtype: OidSubtype) => unknown,
  ): void {
    // Divergence: Rails assumes @store responds to lookup. If a TS TypeMap
    // store omits it, the lazy builder below would silently receive
    // undefined subtypes and produce confusing downstream errors. Fail fast.
    if (!this.store.lookup) {
      throw new Error(`TypeMap store must implement lookup() to register subtype-based OID ${oid}`);
    }
    if (this.storeHas(targetOid)) {
      this.register(oid, (_oid: number | string, ...args: unknown[]) =>
        build(this.storeLookup(targetOid, ...args) as OidSubtype),
      );
    }
  }

  private storeHas(key: number | string): boolean {
    if (this.store.has) return this.store.has(key);
    return this.storeKeys().includes(key);
  }

  private storeKeys(): Array<number | string> {
    return this.store.keys?.() ?? [];
  }

  private storeLookup(key: number | string, ...args: unknown[]): unknown {
    return this.store.lookup?.(key, ...args);
  }

  private assertValidRegistration(
    oid: number | string,
    oidType: unknown | ((oid: number | string, ...args: unknown[]) => unknown),
  ): number {
    if (oidType == null) throw new Error(`can't register nil type for OID ${oid}`);
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
