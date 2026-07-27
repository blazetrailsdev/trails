/**
 * Primary key attribute methods.
 *
 * Mirrors: ActiveRecord::AttributeMethods::PrimaryKey
 */
import { underscore } from "@blazetrails/activesupport";
import { dangerousAttributeMethods } from "../attribute-methods.js";
import type { AbstractAdapter as DatabaseAdapter } from "../connection-adapters/abstract-adapter.js";

interface PrimaryKeyRecord {
  id: unknown;
  readAttribute(name: string): unknown;
  _readAttribute(name: string): unknown;
}

/**
 * Return an array of primary key values for this record, or null if unsaved.
 *
 * Mirrors: ActiveRecord::AttributeMethods::PrimaryKey#to_key
 */
export function toKey(this: PrimaryKeyRecord): unknown[] | null {
  const pk = this.id;
  if (pk == null) return null;
  const arr = Array.isArray(pk) ? pk : [pk];
  if (arr.some((v) => v == null)) return null;
  return arr;
}

/**
 * Check whether all primary key values are present.
 *
 * Mirrors: ActiveRecord::AttributeMethods::PrimaryKey#primary_key_values_present?
 */
export function isPrimaryKeyValuesPresent(this: PrimaryKeyRecord): boolean {
  const pk = (this.constructor as any).primaryKey;
  if (Array.isArray(pk)) {
    return pk.every((col: string) => {
      const v = this._readAttribute(col);
      return v !== null && v !== undefined;
    });
  }
  return this.id != null;
}

function readPkWith(record: PrimaryKeyRecord, method: string): unknown {
  const pk = (record.constructor as any).primaryKey;
  const fn = (record as any)[method];
  if (typeof fn === "function") {
    if (Array.isArray(pk)) return pk.map((k: string) => fn.call(record, k));
    return fn.call(record, pk);
  }
  if (Array.isArray(pk)) return pk.map((k: string) => record._readAttribute(k));
  return record._readAttribute(pk);
}

export function idBeforeTypeCast(this: PrimaryKeyRecord): unknown {
  return readPkWith(this, "readAttributeBeforeTypeCast");
}

export function idWas(this: PrimaryKeyRecord): unknown {
  return readPkWith(this, "attributeWas");
}

export function idInDatabase(this: PrimaryKeyRecord): unknown {
  return readPkWith(this, "attributeInDatabase");
}

export function idForDatabase(this: PrimaryKeyRecord): unknown {
  const pk = (this.constructor as any).primaryKey;
  const attrs = (this as any)._attributes;
  if (attrs?.getAttribute) {
    if (Array.isArray(pk)) {
      return pk.map((k: string) => {
        const attr = attrs.getAttribute(k);
        // valueForDatabase is a getter property, not a method
        return attr != null && "valueForDatabase" in attr
          ? attr.valueForDatabase
          : this._readAttribute(k);
      });
    }
    const attr = attrs.getAttribute(pk);
    if (attr != null && "valueForDatabase" in attr) return attr.valueForDatabase;
  }
  if (Array.isArray(pk)) return pk.map((k: string) => this._readAttribute(k));
  return this._readAttribute(pk);
}

// ---------------------------------------------------------------------------
// Instance accessor methods
// ---------------------------------------------------------------------------

/**
 * Ruby `Object#inspect`-style rendering for the `id=` TypeError message, mirroring
 * `CompositePrimaryKey#id=`'s `#{value.inspect}`.
 */
function inspectValue(value: unknown): string {
  if (value === null || value === undefined) return "nil";
  if (typeof value === "string") return JSON.stringify(value);
  return String(value);
}

interface PrimaryKeyInstance {
  constructor: unknown;
  _readAttribute(name: string): unknown;
  _writeAttribute(name: string, value: unknown): void;
  writeAttribute(name: string, value: unknown): void;
}

function readId(this: PrimaryKeyInstance): unknown {
  const ctor = this.constructor as any;
  const pk = ctor.primaryKey as string | string[] | null;
  if (Array.isArray(pk)) return pk.map((col) => this._readAttribute(col));
  // Rails: `_read_attribute(@primary_key)`. A nil primary key reads through the
  // AttributeSet's Null attribute, returning nil without raising.
  return this._readAttribute(pk as string);
}

function writeId(this: PrimaryKeyInstance, value: unknown): void {
  const ctor = this.constructor as any;
  const pk = ctor.primaryKey as string | string[] | null;
  if (Array.isArray(pk)) {
    // Rails: `raise TypeError unless value.is_a?(Enumerable)` then
    // `@primary_key.zip(value)`. Mirror Ruby's Enumerable with the codebase's
    // Array-or-Set analogue (see sanitization.ts `isEnumerable`) — deliberately
    // not arbitrary iterables, so a String is a scalar that raises like Ruby.
    if (!Array.isArray(value) && !(value instanceof Set)) {
      throw new TypeError(
        `Expected value matching [${pk.map((col) => JSON.stringify(col)).join(", ")}], got ${inspectValue(value)}.`,
      );
    }
    // Rails' `@primary_key.zip(value)` pads short values with nil, so
    // `id = [1]` writes nil to the trailing key part rather than leaving it
    // untouched. Coerce past-the-end elements to null (not undefined) to match.
    const values = Array.isArray(value) ? value : [...value];
    pk.forEach((col, i) => this._writeAttribute(col, i < values.length ? values[i] : null));
  } else if (pk == null) {
    // Key-less model: Rails does NOT install the PrimaryKey `id=` override
    // without a primary key (`instance_method_already_implemented?` gates the
    // ID_ATTRIBUTE_METHODS on `primary_key`), so `id=` is the regular writer for
    // the literal `id` column. Mirror that by writing `id`: a model with an `id`
    // column (`non_primary_keys`) gets the value, and one without (`dashboards`)
    // raises MissingAttributeError like Rails. Route through the public
    // `writeAttribute` (not the bridged `_writeAttribute`, which seeds an
    // unreflected column and would swallow the dashboards raise).
    this.writeAttribute("id", value);
  } else {
    this._writeAttribute(pk, value);
  }
}

/**
 * Home for the module's `id` accessor pair. Ruby names a writer after its
 * reader (`id` / `id=`); TypeScript can only spell that pair as a `get`/`set`
 * on a prototype, and two exported functions in one module can't share a name —
 * so a `setId`-style export would be surface Rails does not have. Hosts pick
 * the pair up with `include()` from `@blazetrails/activesupport`, which copies
 * accessor descriptors intact.
 *
 * Mirrors: ActiveRecord::AttributeMethods::PrimaryKey
 */
export class PrimaryKey {
  // The host surface is asserted at the call, not declared as class fields:
  // a `declare writeAttribute` here would register as TS surface this Rails
  // module does not have (api:extra flags it as moved from write.rb).

  /** Mirrors: ActiveRecord::AttributeMethods::PrimaryKey#id */
  get id(): unknown {
    return readId.call(this as unknown as PrimaryKeyInstance);
  }

  /** Mirrors: ActiveRecord::AttributeMethods::PrimaryKey#id= */
  set id(value: unknown) {
    writeId.call(this as unknown as PrimaryKeyInstance, value);
  }
}

// ---------------------------------------------------------------------------
// Class methods
// ---------------------------------------------------------------------------

interface CachedSchemaSource {
  schemaCache?: { getCachedPrimaryKeys?(table: string): string | string[] | null | undefined };
}

interface PrimaryKeyHost {
  primaryKey: string | string[];
  _primaryKey?: string | string[];
  name: string;
  tableName?: string;
  _adapter?: CachedSchemaSource | null;
  connectionPool?(): {
    activeConnection?: CachedSchemaSource | null;
    poolConfig?: { schemaCache?: CachedSchemaSource["schemaCache"] | null };
  };
}

/**
 * Resolve the cached schema WITHOUT leasing a connection. Reading
 * `this.connection` would route through the deprecated getter and flip the
 * pool's lease to permanent under `permanent_connection_checkout =
 * :deprecated | :disallowed` — so model construction (which reads `primary_key`)
 * would permanently hold a connection. Mirrors Rails' `get_primary_key`, which
 * consults the schema cache rather than checking out a connection.
 */
function cachedSchemaCacheFor(host: PrimaryKeyHost): CachedSchemaSource["schemaCache"] | undefined {
  if (host._adapter?.schemaCache) return host._adapter.schemaCache;
  const pool = host.connectionPool?.();
  return pool?.activeConnection?.schemaCache ?? pool?.poolConfig?.schemaCache ?? undefined;
}

/**
 * Mirrors: ActiveRecord::AttributeMethods::PrimaryKey::ClassMethods#primary_key
 *
 * Honors an explicitly-configured primary key — read through the prototype
 * chain, so an STI subclass inherits the value its base set with `primary_key=`
 * (Rails copies base_class.primary_key into the subclass; the chain is the
 * equivalent here). When nothing is configured anywhere up the chain, mirror
 * Rails' get_primary_key: consult the schema cache so a key-less data source
 * (e.g. a view) resolves to `null` rather than the "id" convention. The lookup
 * is query-free — it reads only what `loadSchema` already warmed — so a cold
 * cache falls back to "id". The `null` it can return matches Rails'
 * dynamically-nil `primary_key` for a key-less data source (a view); this is
 * the one accessor that surfaces that case honestly. The public boundaries
 * (`Base.primaryKey`, the `primaryKey()` class method) and the model-typed
 * `PrimaryKeyHost` deliberately narrow to the non-null `string | string[]`
 * contract — never null for a persistable model — so hot paths that read
 * `primary_key` are not forced to null-guard. That narrowing is the accepted
 * deviation; this function is where the truth lives.
 * @internal
 */
export function getPrimaryKeyAttr(this: PrimaryKeyHost): string | string[] | null {
  const configured = this._primaryKey;
  if (configured !== undefined) return configured;
  try {
    const table = this.tableName;
    const cached = table ? cachedSchemaCacheFor(this)?.getCachedPrimaryKeys?.(table) : undefined;
    if (cached !== undefined) return cached;
  } catch {
    // No connection/schema configured — fall through to the convention.
  }
  return "id";
}

/**
 * Mirrors: ActiveRecord::AttributeMethods::PrimaryKey::ClassMethods#primary_key=
 *
 * `Base` already exposes the Rails-named `static set primaryKey` accessor
 * (base.ts:1157) that delegates here, so this export is redundant public
 * surface; unexporting it is RFC 0081 shape-1 work, not a seam.
 * @internal
 */
export function setPrimaryKeyAttr(this: PrimaryKeyHost, key: string | string[]): void {
  this._primaryKey = key;
}

/**
 * Mirrors: ActiveRecord::AttributeMethods::PrimaryKey::ClassMethods#composite_primary_key?
 *
 * Rails resolves this through the same path as `primary_key` (both trigger
 * `reset_primary_key` on first access), so go through `getPrimaryKeyAttr` rather
 * than reading `_primaryKey` directly — otherwise, now that Base carries no
 * "id" field default, a chain with no configured pk would skip the schema cache
 * and the two methods could disagree.
 * @internal
 */
export function isCompositePrimaryKey(this: PrimaryKeyHost): boolean {
  return Array.isArray(getPrimaryKeyAttr.call(this));
}

/**
 * Mirrors: ActiveRecord::AttributeMethods::PrimaryKey::ClassMethods#primary_key,
 * primary_key=
 */
export function primaryKey(this: PrimaryKeyHost, value?: string | string[]): string | string[] {
  if (value !== undefined) {
    setPrimaryKeyAttr.call(this, value);
    return value;
  }
  // Same type-level assertion as Base.primaryKey (not a runtime guarantee):
  // getPrimaryKeyAttr is the one honest nullable accessor, but public callers
  // see the non-null contract. A view still returns null at runtime.
  return getPrimaryKeyAttr.call(this) as string | string[];
}

/**
 * Mirrors: ActiveRecord::AttributeMethods::PrimaryKey#id, id=
 */
export function id(this: PrimaryKeyInstance, value?: unknown): unknown {
  if (value !== undefined) {
    writeId.call(this, value);
    return value;
  }
  return readId.call(this);
}

export function isInstanceMethodAlreadyImplemented(
  this: PrimaryKeyHost & { prototype: any },
  methodName: string,
): boolean {
  return methodName in this.prototype;
}

export function isDangerousAttributeMethod(_this: PrimaryKeyHost, name: string): boolean {
  return dangerousAttributeMethods().has(name);
}

/**
 * Rails: adapter_class.quote_column_name(primary_key)
 */
export function quotedPrimaryKey(this: PrimaryKeyHost & { connection?: DatabaseAdapter }): string {
  const pk = this.primaryKey;
  const quoter = this.connection;
  const fallback = (k: string) => `"${k.replace(/"/g, '""')}"`;
  if (Array.isArray(pk))
    return pk.map((k) => (quoter ? quoter.quoteColumnName(k) : fallback(k))).join(", ");
  return quoter ? quoter.quoteColumnName(pk) : fallback(pk);
}

export function resetPrimaryKey(this: PrimaryKeyHost): void {
  const parent = Object.getPrototypeOf(this);
  const parentPk =
    parent && typeof parent === "function"
      ? (parent as Partial<PrimaryKeyHost>).primaryKey
      : undefined;
  this._primaryKey = parentPk ?? "id";
}

/**
 * Rails: foreign_key(false) → "admin_userid", foreign_key → "admin_user_id".
 * Falls back to "id" when no prefix type is configured.
 */
export function getPrimaryKey(
  this: PrimaryKeyHost & { tableExists?(): Promise<boolean> },
  baseName?: string,
): string {
  if (baseName) {
    const prefixType = (this as any).primaryKeyPrefixType;
    if (prefixType === "table_name") {
      // foreign_key(false): underscore + "id" with no separator
      return underscore(baseName) + "id";
    }
    if (prefixType === "table_name_with_underscore") {
      // foreign_key: underscore + "_id"
      return underscore(baseName) + "_id";
    }
  }
  return "id";
}

// Mirrors: ActiveRecord::AttributeMethods::PrimaryKey::ClassMethods private#attribute_method?
/** @internal */
function attributeMethod(this: any, attrName: string): boolean {
  const pk = this.primaryKey;
  return Array.isArray(pk) ? pk.includes(attrName) : attrName === pk;
}
