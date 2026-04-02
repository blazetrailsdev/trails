import { Model } from "@blazetrails/activemodel";
import "./type.js"; // Register AR type overrides into AM's type registry
import {
  Table,
  quoteArrayLiteral,
  InsertManager,
  UpdateManager,
  DeleteManager,
  Nodes,
  sql as arelSql,
  star as arelStar,
} from "@blazetrails/arel";
import type { DatabaseAdapter } from "./adapter.js";
import {
  getInheritanceColumn,
  isStiSubclass,
  getStiBase,
  instantiateSti,
  computeType as inheritanceComputeType,
  subclasses as inheritanceSubclasses,
  descendants as inheritanceDescendants,
} from "./inheritance.js";
import {
  RecordNotFound,
  RecordInvalid,
  RecordNotSaved,
  RecordNotDestroyed,
  StaleObjectError,
  ReadOnlyRecord,
  ConnectionNotDefined,
  DangerousAttributeError,
  AttributeAssignmentError,
} from "./errors.js";
import { encrypts as _encrypts, getEncryptor } from "./encryption.js";
import * as CounterCache from "./counter-cache.js";
import * as ReadonlyAttributes from "./readonly-attributes.js";
import * as Timestamp from "./timestamp.js";
import { Association as AssociationInstance } from "./associations/association.js";
import { ConnectionHandler } from "./connection-adapters/abstract/connection-handler.js";
import * as ConnectionHandling from "./connection-handling.js";
import * as ModelSchema from "./model-schema.js";
import * as SignedIdModule from "./signed-id.js";
import * as LockingOptimistic from "./locking/optimistic.js";
import * as LockingPessimistic from "./locking/pessimistic.js";
import * as Translation from "./translation.js";
import { sanitizeSqlArray, sanitizeSqlLike } from "./sanitization.js";
import {
  hasAttribute as _hasAttribute,
  attributePresent as _attributePresent,
  attributeNamesList as _attributeNamesList,
  accessedFields as _accessedFields,
} from "./attribute-methods.js";
import { toKey as _toKey } from "./attribute-methods/primary-key.js";
import {
  toParam as _toParam,
  cacheKey as _cacheKey,
  cacheKeyWithVersion as _cacheKeyWithVersion,
  cacheVersion as _cacheVersion,
} from "./integration.js";
import {
  noTouching as _noTouchingBlock,
  isAppliedTo as _isNoTouchingApplied,
} from "./no-touching.js";
import { suppress as _suppressBlock, isSuppressed as _isSuppressed } from "./suppressor.js";
import {
  inspect as _inspect,
  attributeForInspect as _attributeForInspect,
  isEqual as _isEqual,
  isPresent as _isPresent,
  isBlank as _isBlank,
} from "./core.js";
import { ScopeRegistry } from "./scoping.js";

import { Default as DefaultScoping } from "./scoping/default.js";
import { Named as NamedScoping } from "./scoping/named.js";
import { AssociationNotFoundError } from "./associations/errors.js";
import { BelongsToAssociation } from "./associations/belongs-to-association.js";
import { BelongsToPolymorphicAssociation } from "./associations/belongs-to-polymorphic-association.js";
import { HasOneAssociation } from "./associations/has-one-association.js";
import { HasOneThroughAssociation } from "./associations/has-one-through-association.js";
import { HasManyAssociation } from "./associations/has-many-association.js";
import { HasManyThroughAssociation } from "./associations/has-many-through-association.js";

/** @internal */
export function quoteSqlValue(v: unknown, asArray = false): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (v instanceof Date) return `'${v.toISOString()}'`;
  if (asArray && Array.isArray(v)) {
    const arrayLiteral = quoteArrayLiteral(v);
    return `'${arrayLiteral.replace(/'/g, "''")}'`;
  }
  if (typeof v === "object") return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

// Late-bound Relation constructor to break circular dependency.
// Set by relation.ts when it loads.
let _RelationCtor: (new (modelClass: typeof Base) => any) | null = null;
let _wrapWithScopeProxy: ((rel: any) => any) | null = null;

/** @internal Called by relation.ts to register itself. */
export function _setRelationCtor(ctor: new (modelClass: typeof Base) => any): void {
  _RelationCtor = ctor;
}

/** @internal Called by relation.ts to register the scope proxy wrapper. */
export function _setScopeProxyWrapper(wrapper: (rel: any) => any): void {
  _wrapWithScopeProxy = wrapper;
}

// Late-bound validateAssociations to break circular dependency with autosave.ts
let _validateAssociationsFn: ((record: any, context?: string) => void) | null = null;

/** @internal Called by autosave.ts to register validateAssociations. */
export function _setValidateAssociationsFn(fn: (record: any, context?: string) => void): void {
  _validateAssociationsFn = fn;
}

/** @internal Hook called when a model's adapter is set. Used by test-adapter.ts. */
let _onAdapterSet: ((modelClass: any) => void) | null = null;
export function _setOnAdapterSetHook(hook: ((modelClass: any) => void) | null): void {
  _onAdapterSet = hook;
}

/**
 * Base — the core ActiveRecord class with persistence and finders.
 *
 * Mirrors: ActiveRecord::Base
 */
export class Base extends Model {
  static get i18nScope(): string {
    return Translation.i18nScope(this);
  }

  static lookupAncestors(): Array<typeof Base> {
    return Translation.lookupAncestors(this);
  }

  // -- Class-level configuration --
  static _tableName: string | null = null;
  static _primaryKey: string | string[] = "id";
  static _adapter: DatabaseAdapter | null = null;
  static _connectionHandler: ConnectionHandler = new ConnectionHandler();
  static _configPath: string | null = null;
  static _abstractClass = false;
  static _tableNamePrefix = "";
  static _tableNameSuffix = "";
  static _protectedEnvironments: string[] = ["production"];
  static _lockingColumn: string = "lock_version";

  /**
   * List of environments where destructive actions are prohibited.
   *
   * Mirrors: ActiveRecord::Base.protected_environments
   */
  static get protectedEnvironments(): string[] {
    return this._protectedEnvironments;
  }

  static set protectedEnvironments(envs: string[]) {
    this._protectedEnvironments = envs.map(String);
  }

  /**
   * Mark this class as abstract — it won't have its own table.
   * Does not inherit from parent: only true if explicitly set on this class.
   *
   * Mirrors: ActiveRecord::Base.abstract_class
   */
  static get abstractClass(): boolean {
    return Object.prototype.hasOwnProperty.call(this, "_abstractClass")
      ? this._abstractClass
      : false;
  }

  static set abstractClass(value: boolean) {
    this._abstractClass = value;
  }

  /**
   * Prefix applied to the inferred table name.
   *
   * Mirrors: ActiveRecord::Base.table_name_prefix
   */
  static get tableNamePrefix(): string {
    return this._tableNamePrefix;
  }

  static set tableNamePrefix(prefix: string) {
    this._tableNamePrefix = prefix;
  }

  /**
   * Suffix applied to the inferred table name.
   *
   * Mirrors: ActiveRecord::Base.table_name_suffix
   */
  static get tableNameSuffix(): string {
    return this._tableNameSuffix;
  }

  static set tableNameSuffix(suffix: string) {
    this._tableNameSuffix = suffix;
  }

  /**
   * Set or get the table name. Inferred from class name if not set.
   *
   * Mirrors: ActiveRecord::Base.table_name
   */
  static get tableName(): string {
    return ModelSchema.resolveTableName(this);
  }

  static set tableName(name: string) {
    this._tableName = name;
  }

  /**
   * Set or get the primary key. Defaults to "id".
   *
   * Mirrors: ActiveRecord::Base.primary_key
   */
  static get primaryKey(): string | string[] {
    return this._primaryKey;
  }

  static set primaryKey(key: string | string[]) {
    this._primaryKey = key;
  }

  /**
   * The column used for optimistic locking. Defaults to "lock_version".
   *
   * Mirrors: ActiveRecord::Locking::Optimistic.locking_column
   */
  static get lockingColumn(): string {
    return LockingOptimistic.lockingColumn(this);
  }

  static set lockingColumn(col: string) {
    LockingOptimistic.setLockingColumn(this, col);
  }

  static get lockingEnabled(): boolean {
    return LockingOptimistic.lockingEnabled(this);
  }

  /**
   * Returns true if this model uses a composite primary key.
   *
   * Mirrors: ActiveRecord::Base.composite_primary_key?
   */
  static get compositePrimaryKey(): boolean {
    return Array.isArray(this._primaryKey);
  }

  /**
   * Quote a single value for use in SQL.
   */
  static _buildPkWhere(idValue: unknown): string {
    return ModelSchema.buildPkWhere(this, idValue);
  }

  static _buildPkWhereNode(idValue: unknown): InstanceType<typeof Nodes.Node> {
    return ModelSchema.buildPkWhereNode(this, idValue);
  }

  /**
   * Override attribute() to prevent generating an accessor for "id",
   * since Base already defines id getter/setter with CPK support.
   */
  static attribute(name: string, typeName: string, options?: { default?: unknown }): void {
    super.attribute(name, typeName, options);
    // If we just defined an "id" accessor on a subclass prototype, remove it
    // so Base.prototype.id (which handles CPK) is used instead.
    if (name === "id" && Object.prototype.hasOwnProperty.call(this.prototype, "id")) {
      delete (this.prototype as any).id;
    }
  }

  /**
   * Get the Arel table for this model.
   *
   * Mirrors: ActiveRecord::Base.arel_table
   */
  static get arelTable(): Table {
    return new Table(this.tableName);
  }

  /**
   * Create the database table for this model from its attribute definitions.
   * Drops the table first if it already exists to handle schema changes
   * between tests.
   *
   * This is a test/development helper — in production, use migrations.
   */
  static async createTable(): Promise<void> {
    return ModelSchema.createTable(this);
  }

  /**
   * Set the database adapter for this model class.
   *
   * This is a convenience setter that bypasses the ConnectionHandler/ConnectionPool
   * infrastructure. Prefer `establishConnection` for production use.
   */
  static set adapter(adapter: DatabaseAdapter) {
    this._adapter = adapter;
    if (_onAdapterSet) _onAdapterSet(this);
  }

  /**
   * Get the database connection for this model.
   *
   * Returns the adapter from either:
   * 1. Directly assigned adapter (via `Model.adapter = ...`)
   * 2. Connection checked out from ConnectionHandler pool
   *    (set up by `await establishConnection()`)
   *
   * Throws if no connection has been established.
   *
   * Mirrors: ActiveRecord::Base.connection
   */
  static get adapter(): DatabaseAdapter {
    // Fast path: directly assigned adapter (used by tests and simple setups)
    if (this._adapter) return this._adapter;

    // Check for a model-specific pool first
    const modelPool = this._connectionHandler.retrieveConnectionPool(this.name);
    if (modelPool) {
      this._adapter = modelPool.checkout();
      if (_onAdapterSet) _onAdapterSet(this);
      return this._adapter;
    }

    // Fall back to the shared primary pool — cache on Base so all subclasses
    // share one connection instead of checking out per-model connections
    const primaryPool = this._connectionHandler.retrieveConnectionPool("primary");
    if (primaryPool) {
      if (!Base._adapter) {
        Base._adapter = primaryPool.checkout();
        if (_onAdapterSet) _onAdapterSet(Base);
      }
      return Base._adapter;
    }

    throw new ConnectionNotDefined(
      `No connection pool for '${this.name}' found. ` +
        `Call await ${this.name}.establishConnection() or set ${this.name}.adapter directly`,
      { connectionName: this.name },
    );
  }

  static get connectionHandler(): ConnectionHandler {
    return this._connectionHandler;
  }

  /**
   * Establish a database connection from a URL, config object, or config file.
   *
   * Accepts:
   * - A URL string: `Base.establishConnection("postgres://localhost/mydb")`
   * - A config object: `Base.establishConnection({ adapter: "postgresql", url: "..." })`
   * - No arguments: loads from `config/database.json` for NODE_ENV, or DATABASE_URL
   *
   * Creates a ConnectionPool managed by the ConnectionHandler, mirroring how
   * Rails wires establish_connection → ConnectionHandler → ConnectionPool.
   *
   * Mirrors: ActiveRecord::Base.establish_connection
   */
  static async establishConnection(
    config?:
      | string
      | {
          adapter?: string;
          url?: string;
          database?: string;
          host?: string;
          port?: number;
          username?: string;
          password?: string;
          [key: string]: unknown;
        },
  ): Promise<void> {
    return ConnectionHandling.establishConnection(this, config);
  }

  /**
   * Return the list of column names (attribute names).
   *
   * Mirrors: ActiveRecord::Base.column_names
   */
  static columnNames(): string[] {
    return ModelSchema.columnNames(this);
  }

  static hasAttributeDefinition(name: string): boolean {
    return ModelSchema.hasAttributeDefinition(this, name);
  }

  static columnsHash(): Record<string, { name: string; type: string; default: unknown }> {
    return ModelSchema.columnsHash(this);
  }

  static contentColumns(): string[] {
    return ModelSchema.contentColumns(this);
  }

  /**
   * Return the STI inheritance column name, if STI is enabled.
   *
   * Mirrors: ActiveRecord::Base.inheritance_column
   */
  static get inheritanceColumn(): string | null {
    return (this as any)._inheritanceColumn ?? null;
  }
  static set inheritanceColumn(col: string | null) {
    (this as any)._inheritanceColumn = col;
  }

  /**
   * Return the base class in an STI hierarchy.
   *
   * Mirrors: ActiveRecord::Base.base_class
   */
  static get baseClass(): typeof Base {
    return getStiBase(this);
  }

  static computeType(typeName: string): typeof Base {
    return inheritanceComputeType(this, typeName);
  }

  static get subclasses(): (typeof Base)[] {
    return inheritanceSubclasses(this);
  }

  static get descendants(): (typeof Base)[] {
    return inheritanceDescendants(this);
  }

  // -- Logger --
  static _logger: { debug?: Function; info?: Function; warn?: Function; error?: Function } | null =
    null;

  /**
   * Set or get the logger for SQL and lifecycle events.
   *
   * Mirrors: ActiveRecord::Base.logger
   */
  static get logger(): {
    debug?: Function;
    info?: Function;
    warn?: Function;
    error?: Function;
  } | null {
    return this._logger;
  }

  static set logger(
    log: { debug?: Function; info?: Function; warn?: Function; error?: Function } | null,
  ) {
    this._logger = log;
  }

  // -- Timestamp control --
  static _recordTimestamps = true;

  static get recordTimestamps(): boolean {
    return this._recordTimestamps;
  }

  static set recordTimestamps(value: boolean) {
    this._recordTimestamps = value;
  }

  static async noTouching<R>(fn: () => R | Promise<R>): Promise<R> {
    return _noTouchingBlock(this, fn);
  }

  static get isTouchingSuppressed(): boolean {
    return _isNoTouchingApplied(this);
  }

  // -- Sequence name --
  static _sequenceName: string | null = null;

  /**
   * The sequence name used for auto-incrementing the primary key.
   * Defaults to "${tableName}_${primaryKey}_seq" for PostgreSQL.
   *
   * Mirrors: ActiveRecord::Base.sequence_name
   */
  static get sequenceName(): string | null {
    const pk = this.primaryKey;
    if (Array.isArray(pk)) return this._sequenceName;
    return this._sequenceName ?? `${this.tableName}_${pk}_seq`;
  }
  static set sequenceName(name: string | null) {
    this._sequenceName = name;
  }

  // -- Ignored columns --
  static _ignoredColumns: string[] = [];

  /**
   * Columns that should be ignored (not loaded from the database).
   *
   * Mirrors: ActiveRecord::Base.ignored_columns
   */
  static get ignoredColumns(): string[] {
    return this._ignoredColumns;
  }

  static set ignoredColumns(columns: string[]) {
    this._ignoredColumns = columns;
    for (const col of columns) {
      // Delete own accessor or shadow inherited one with undefined descriptor
      if (col in this.prototype) {
        Object.defineProperty(this.prototype, col, {
          get: undefined,
          set: undefined,
          configurable: true,
        });
        delete (this.prototype as any)[col];
      }
    }
  }

  // -- Readonly attributes --
  static _readonlyAttributes: Set<string> = new Set();

  /**
   * Mark attributes as readonly — they can be set on create but not on update.
   *
   * Mirrors: ActiveRecord::Base.attr_readonly
   */
  static attrReadonly(...attributes: string[]): void {
    ReadonlyAttributes.attrReadonly(this, ...attributes);
  }

  /**
   * Return the list of readonly attribute names.
   *
   * Mirrors: ActiveRecord::Base.readonly_attributes
   */
  static get readonlyAttributes(): string[] {
    return ReadonlyAttributes.readonlyAttributes(this);
  }

  // -- Encrypted attributes --

  /**
   * Declare attributes as encrypted.
   * Reads decrypt, writes encrypt transparently.
   *
   * Mirrors: ActiveRecord::Encryption.encrypts
   */
  static encrypts(
    ...args: Array<string | { encryptor?: import("./encryption.js").Encryptor }>
  ): void {
    _encrypts(this, ...args);
  }

  static async suppress<R>(fn: () => R | Promise<R>): Promise<R> {
    return _suppressBlock(this, fn);
  }

  static get isSuppressed(): boolean {
    return _isSuppressed(this);
  }

  /**
   * Validate that all named associations are themselves valid.
   *
   * Mirrors: ActiveRecord::Validations::ClassMethods#validates_associated
   */
  static validatesAssociated(...associationNames: string[]): void {
    this.beforeValidation(async function (this: Base) {
      for (const name of associationNames) {
        const cached =
          (this as any)._preloadedAssociations?.get(name) ??
          (this as any)._cachedAssociations?.get(name);
        if (!cached) continue;
        const records = Array.isArray(cached) ? cached : [cached];
        for (const record of records) {
          if (record && typeof record.isValid === "function" && !record.isValid()) {
            this.errors.add(name, "invalid");
          }
        }
      }
    });
  }

  // -- Enums --
  static _enums: Map<string, Record<string, number>> = new Map();

  /**
   * Declare an enum attribute. Maps symbolic names to integer values.
   * Defines scopes, predicate methods, and bang setter methods.
   *
   * Mirrors: ActiveRecord::Enum.enum
   */
  static enum(
    attribute: string,
    mapping: Record<string, number>,
    options?: { prefix?: boolean | string; suffix?: boolean | string },
  ): void {
    if (!Object.prototype.hasOwnProperty.call(this, "_enums")) {
      this._enums = new Map(this._enums);
    }
    this._enums.set(attribute, mapping);

    const prefix =
      options?.prefix === true
        ? `${attribute}_`
        : typeof options?.prefix === "string"
          ? `${options.prefix}_`
          : "";
    const suffix =
      options?.suffix === true
        ? `_${attribute}`
        : typeof options?.suffix === "string"
          ? `_${options.suffix}`
          : "";

    // Override readAttribute to return the symbol name
    const origRead = this.prototype.readAttribute;
    const attrName = attribute;
    const reverseMap: Record<number, string> = {};
    for (const [name, value] of Object.entries(mapping)) {
      reverseMap[value] = name;
    }

    // Define getter that returns the symbol name
    Object.defineProperty(this.prototype, attribute, {
      get(this: Base) {
        const raw = this._attributes.get(attrName);
        if (typeof raw === "number" && raw in reverseMap) return reverseMap[raw];
        if (typeof raw === "string" && raw in mapping) return raw;
        return raw;
      },
      set(this: Base, value: unknown) {
        if (typeof value === "string" && value in mapping) {
          this.writeAttribute(attrName, mapping[value as string]);
        } else {
          this.writeAttribute(attrName, value);
        }
      },
      configurable: true,
    });

    // Define predicate methods and bang setters for each enum value
    for (const [name, value] of Object.entries(mapping)) {
      const methodBase = `${prefix}${name}${suffix}`;

      // Predicate: user.active? → user.isActive()
      Object.defineProperty(
        this.prototype,
        `is${methodBase.charAt(0).toUpperCase()}${methodBase.slice(1)}`,
        {
          value: function (this: Base) {
            return this._attributes.get(attrName) === value;
          },
          writable: true,
          configurable: true,
        },
      );

      // Bang setter: user.active! → user.activeBang()
      Object.defineProperty(this.prototype, `${methodBase}Bang`, {
        value: function (this: Base) {
          this.writeAttribute(attrName, value);
          return this;
        },
        writable: true,
        configurable: true,
      });

      // Scope: User.active → User.where({ status: 0 })
      if (!Object.prototype.hasOwnProperty.call(this, "_scopes")) {
        this._scopes = new Map(this._scopes);
      }
      this._scopes.set(methodBase, (rel: any) => rel.where({ [attrName]: value }));

      // Static method that delegates to the scope
      Object.defineProperty(this, methodBase, {
        value: function () {
          return (this as typeof Base).all()[methodBase]();
        },
        writable: true,
        configurable: true,
      });
    }

    // Static method to get the mapping
    Object.defineProperty(this, `${attribute}s`, {
      get() {
        return { ...mapping };
      },
      configurable: true,
    });
  }

  // -- Store --
  static _storedAttributes: Map<string, { accessors?: string[] }> = new Map();

  /**
   * Declare a stored attribute backed by a JSON/text column.
   * Defines accessors for individual keys within the stored hash.
   *
   * Mirrors: ActiveRecord::Store.store
   */
  static store(attribute: string, options?: { accessors?: string[] }): void {
    if (!Object.prototype.hasOwnProperty.call(this, "_storedAttributes")) {
      this._storedAttributes = new Map(this._storedAttributes);
    }
    this._storedAttributes.set(attribute, options ?? {});

    // Define accessor methods for each key
    if (options?.accessors) {
      for (const accessor of options.accessors) {
        Object.defineProperty(this.prototype, accessor, {
          get(this: Base) {
            const store = this._attributes.get(attribute);
            if (store && typeof store === "object") {
              return (store as Record<string, unknown>)[accessor] ?? null;
            }
            return null;
          },
          set(this: Base, value: unknown) {
            let store = this._attributes.get(attribute);
            if (!store || typeof store !== "object") {
              store = {};
            }
            const newStore = { ...(store as Record<string, unknown>), [accessor]: value };
            this.writeAttribute(attribute, newStore);
          },
          configurable: true,
        });
      }
    }
  }

  // -- Scopes registry (used by Relation) --
  static _scopes: Map<string, (rel: any, ...args: any[]) => any> = new Map();
  static _defaultScope: ((rel: any) => any) | null = null;

  /**
   * Define a default scope applied to all queries.
   *
   * Mirrors: ActiveRecord::Base.default_scope
   */
  static defaultScope(fn: (rel: any) => any): void {
    this._defaultScope = fn;
  }

  /**
   * Return a relation that bypasses the default scope.
   *
   * Mirrors: ActiveRecord::Base.unscoped
   */
  static unscoped(): any {
    return DefaultScoping.unscoped(this, () => {
      if (!_RelationCtor) {
        throw new Error("Relation not loaded. Import relation.ts first.");
      }
      const rel = new _RelationCtor(this);
      return _wrapWithScopeProxy ? _wrapWithScopeProxy(rel) : rel;
    });
  }

  /** @internal Like all() but skips currentScope — used by the preloader. */
  static _allForPreload(): any {
    return this._buildDefaultRelation();
  }

  private static _buildDefaultRelation(): any {
    if (!_RelationCtor) {
      throw new Error("Relation not loaded. Import relation.ts first.");
    }
    let rel = DefaultScoping.buildDefaultScope(this, () => {
      const r = new _RelationCtor!(this);
      return _wrapWithScopeProxy ? _wrapWithScopeProxy(r) : r;
    });
    if (isStiSubclass(this)) {
      const col = getInheritanceColumn(getStiBase(this));
      if (col) {
        const stiNames = [this.name, ...this.descendants.map((d: typeof Base) => d.name)];
        rel = rel.where({ [col]: stiNames.length === 1 ? stiNames[0] : stiNames });
      }
    }
    return rel;
  }

  // Scope extension methods: scope name -> Record of extra methods
  static _scopeExtensions: Map<string, Record<string, Function>> = new Map();

  /**
   * Define a named scope with an optional extension block.
   *
   * The extension object adds extra methods to the returned relation
   * when the scope is invoked.
   *
   * Mirrors: ActiveRecord::Base.scope (with extension block)
   */
  static scope(
    name: string,
    fn: (rel: any, ...args: any[]) => any,
    extension?: Record<string, Function>,
  ): void {
    NamedScoping.defineScope(this, name, fn, extension);
  }

  // -- Scoping --

  /**
   * Execute a block with the given relation as the current scope.
   *
   * Mirrors: ActiveRecord::Relation#scoping
   */
  static async scoping<R>(rel: any, fn: () => R | Promise<R>): Promise<R> {
    const prev = ScopeRegistry.currentScope(this);
    ScopeRegistry.setCurrentScope(this, rel);
    try {
      return await fn();
    } finally {
      ScopeRegistry.setCurrentScope(this, prev);
    }
  }

  /**
   * Return the current scope if set, or null.
   *
   * Mirrors: ActiveRecord::Base.current_scope
   */
  static get currentScope(): any | null {
    return ScopeRegistry.currentScope(this);
  }

  // -- Finders (class methods) --

  /**
   * Find a record by primary key, or an array of records by primary keys.
   *
   * Mirrors: ActiveRecord::Base.find
   */
  /** @internal Cast a value through an attribute's type, with parseInt fallback for the default PK. */
  static _castAttributeValue(key: string, value: unknown): unknown {
    if (typeof value !== "string") return value;
    const def = this._attributeDefinitions.get(key);
    if (def) return def.type.cast(value);
    if (typeof this.primaryKey === "string" && key === this.primaryKey) {
      const parsed = parseInt(value, 10);
      if (!isNaN(parsed)) return parsed;
    }
    return value;
  }

  static async find(...ids: unknown[]): Promise<any> {
    // Variadic: User.find(1, 2, 3)
    if (ids.length > 1) {
      return this.find(ids);
    }
    const id = ids[0];

    // CPK: find([shop_id, id]) finds a single record by composite tuple
    if (this.compositePrimaryKey && Array.isArray(id)) {
      // Check if this is a single tuple or array of tuples
      if (id.length > 0 && Array.isArray(id[0])) {
        // Array of tuples: find([[1,2], [3,4]])
        const tuples = id as unknown[][];
        if (tuples.length === 0) {
          throw new RecordNotFound(
            `${this.name}: couldn't find all with an empty list of ids`,
            this.name,
            String(this.primaryKey),
            [],
          );
        }
        const whereNodes = tuples.map((tuple) => ModelSchema.buildPkWhereNode(this, tuple));
        const orCondition = whereNodes.reduce((left, right) => new Nodes.Or(left, right));
        const records = await this.all().where(orCondition).toArray();
        if (records.length !== tuples.length) {
          throw new RecordNotFound(
            `${this.name}: couldn't find all with composite primary key`,
            this.name,
            String(this.primaryKey),
            id,
          );
        }
        return records;
      }
      // Single tuple: find([shop_id, id])
      const pk = this.primaryKey as string[];
      const whereConditions: Record<string, unknown> = {};
      pk.forEach((col, i) => {
        whereConditions[col] = (id as unknown[])[i];
      });
      const record = await this.all().where(whereConditions).first();
      if (!record) {
        throw new RecordNotFound(
          `${this.name} with ${this.primaryKey}=[${id}] not found`,
          this.name,
          String(this.primaryKey),
          id,
        );
      }
      return record;
    }

    // Multiple IDs — return an array
    if (Array.isArray(id)) {
      if (id.length === 0) {
        throw new RecordNotFound(
          `${this.name}: couldn't find all with an empty list of ids`,
          this.name,
          String(this.primaryKey),
          [],
        );
      }
      const castIds = id.map((i) => this._castAttributeValue(this.primaryKey as string, i));
      const records = await this.all()
        .where({ [this.primaryKey as string]: castIds })
        .toArray();
      // Ensure all IDs were found
      if (records.length !== castIds.length) {
        const foundIds = new Set(records.map((r: Base) => r.id));
        const missing = castIds.filter((i) => !foundIds.has(i));
        throw new RecordNotFound(
          `${this.name} with ${this.primaryKey} in [${missing.join(", ")}] not found`,
          this.name,
          String(this.primaryKey),
          id,
        );
      }
      // Return in input order, matching Rails' in_order_of behavior
      const idToRecord = new Map<unknown, Base>();
      for (const r of records) idToRecord.set(r.id, r);
      return castIds.map((cid) => idToRecord.get(cid)!);
    }
    // Single ID — cast through PK type, then use all() so STI type filter is applied
    const castId = this._castAttributeValue(this.primaryKey as string, id);
    const record = await this.all()
      .where({ [this.primaryKey as string]: castId })
      .first();
    if (!record) {
      throw new RecordNotFound(
        `${this.name} with ${this.primaryKey}=${id} not found`,
        this.name,
        String(this.primaryKey),
        id,
      );
    }
    return record;
  }

  /**
   * Find the first record matching conditions.
   *
   * Mirrors: ActiveRecord::Base.find_by
   */
  static async findBy(conditions: Record<string, unknown>): Promise<Base | null> {
    const table = this.arelTable;
    const manager = table.project("*");

    for (const [key, value] of Object.entries(conditions)) {
      if (value === null) {
        manager.where(table.get(key).isNull());
      } else {
        manager.where(table.get(key).eq(value));
      }
    }

    manager.take(1);
    const sql = manager.toSql();
    const rows = await this.adapter.execute(sql);
    if (rows.length === 0) return null;

    return this._instantiate(rows[0]);
  }

  /**
   * Find the first record matching conditions, or throw.
   *
   * Mirrors: ActiveRecord::Base.find_by!
   */
  static async findByBang(conditions: Record<string, unknown>): Promise<Base> {
    const record = await this.findBy(conditions);
    if (!record) {
      throw new RecordNotFound(`${this.name} not found`, this.name);
    }
    return record;
  }

  /**
   * Dynamic finder by a single attribute name.
   * e.g., User.findByName("Alice") → User.findBy({ name: "Alice" })
   *
   * Mirrors: ActiveRecord::Base.find_by_* dynamic finders
   */
  static async findByAttribute(attribute: string, value: unknown): Promise<Base | null> {
    return this.findBy({ [attribute]: value });
  }

  /**
   * Check if a dynamic finder method name is valid.
   *
   * Mirrors: ActiveRecord::Base.respond_to_missing?
   */
  static respondToMissingFinder(methodName: string): boolean {
    if (!methodName.startsWith("findBy")) return false;
    const attrPart = methodName.slice(6); // remove "findBy"
    if (!attrPart) return false;
    // Convert camelCase to snake_case: findByFirstName → first_name
    const attr = attrPart
      .replace(/^./, (c) => c.toLowerCase())
      .replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
    return this._attributeDefinitions.has(attr);
  }

  /**
   * Find the sole record matching conditions.
   * Raises RecordNotFound if none, SoleRecordExceeded if more than one.
   *
   * Mirrors: ActiveRecord::Base.find_sole_by
   */
  static async findSoleBy(conditions: Record<string, unknown>): Promise<Base> {
    return this.all().where(conditions).sole();
  }

  /**
   * Return all records as a Relation.
   *
   * Mirrors: ActiveRecord::Base.all
   */
  static all(): any {
    const scope = this.currentScope;
    if (scope) {
      return scope._clone();
    }
    return this._buildDefaultRelation();
  }

  /**
   * Shorthand for all().from(source).
   *
   * Mirrors: ActiveRecord::Base.from
   */
  static from(source: string): any {
    return this.all().from(source);
  }

  /**
   * Shorthand for all().where(conditions).
   *
   * Mirrors: ActiveRecord::Base.where
   */
  static where(conditions: Record<string, unknown>): any;
  static where(sql: string, ...binds: unknown[]): any;
  static where(conditionsOrSql: Record<string, unknown> | string, ...binds: unknown[]): any {
    if (this.abstractClass) {
      throw new Error(`Cannot call where on abstract class ${this.name}`);
    }
    if (typeof conditionsOrSql === "string") {
      return this.all().where(conditionsOrSql, ...binds);
    }
    return this.all().where(conditionsOrSql);
  }

  static whereNot(conditions: Record<string, unknown>): any {
    return this.all().whereNot(conditions);
  }

  /**
   * Insert multiple records in a single INSERT statement (skip callbacks/validations).
   *
   * Mirrors: ActiveRecord::Base.insert_all
   */
  static async insertAll(
    records: Record<string, unknown>[],
    options?: { uniqueBy?: string | string[] },
  ): Promise<number> {
    return this.all().insertAll(records, options);
  }

  /**
   * Upsert multiple records in a single statement (skip callbacks/validations).
   *
   * Mirrors: ActiveRecord::Base.upsert_all
   */
  static async upsertAll(
    records: Record<string, unknown>[],
    options?: {
      uniqueBy?: string | string[];
      updateOnly?: string | string[];
      onDuplicate?: unknown;
    },
  ): Promise<number> {
    return this.all().upsertAll(records, options);
  }

  /**
   * Update all records matching the default scope.
   *
   * Mirrors: ActiveRecord::Base.update_all
   */
  static async updateAll(updates: Record<string, unknown>): Promise<number> {
    if (this.abstractClass) {
      throw new Error(`Cannot call updateAll on abstract class ${this.name}`);
    }
    return this.all().updateAll(updates);
  }

  /**
   * Delete all records (no callbacks).
   *
   * Mirrors: ActiveRecord::Base.delete_all
   */
  static async deleteAll(): Promise<number> {
    if (this.abstractClass) {
      throw new Error(`Cannot call deleteAll on abstract class ${this.name}`);
    }
    return this.all().deleteAll();
  }

  /**
   * Destroy records matching conditions (runs callbacks).
   *
   * Mirrors: ActiveRecord::Base.destroy_by
   */
  static async destroyBy(conditions: Record<string, unknown>): Promise<Base[]> {
    return this.all().where(conditions).destroyAll();
  }

  /**
   * Delete records matching conditions (no callbacks).
   *
   * Mirrors: ActiveRecord::Base.delete_by
   */
  static async deleteBy(conditions: Record<string, unknown>): Promise<number> {
    return this.all().where(conditions).deleteAll();
  }

  /**
   * Find and update a record by primary key.
   *
   * Mirrors: ActiveRecord::Base.update(id, attrs)
   */
  static async update(id: unknown, attrs: Record<string, unknown>): Promise<Base> {
    const record = await this.find(id);
    await record.update(attrs);
    return record;
  }

  /**
   * Destroy a record by primary key (with callbacks).
   *
   * Mirrors: ActiveRecord::Base.destroy(id)
   */
  static async destroy(id: unknown | unknown[]): Promise<Base | Base[]> {
    if (Array.isArray(id)) {
      const records = await this.find(id);
      for (const record of records) {
        await record.destroy();
      }
      return records;
    }
    const record = await this.find(id);
    await record.destroy();
    return record;
  }

  /**
   * Destroy all records (with callbacks).
   *
   * Mirrors: ActiveRecord::Base.destroy_all
   */
  static async destroyAll(): Promise<Base[]> {
    return this.all().destroyAll();
  }

  /**
   * Update a record and raise on validation failure.
   *
   * Mirrors: ActiveRecord::Base.update!
   */
  static async updateBang(id: unknown, attrs: Record<string, unknown>): Promise<Base> {
    const record = await this.find(id);
    await record.updateBang(attrs);
    return record;
  }

  /**
   * Touch all records matching conditions (update timestamps).
   *
   * Mirrors: ActiveRecord::Relation#touch_all
   */
  static async touchAll(...names: string[]): Promise<number> {
    return Timestamp.touchAll(this, ...names);
  }

  /**
   * Return the second record.
   * Mirrors: ActiveRecord::Base.second
   */
  static async second(): Promise<Base | null> {
    return this.all().second();
  }

  /**
   * Return the third record.
   * Mirrors: ActiveRecord::Base.third
   */
  static async third(): Promise<Base | null> {
    return this.all().third();
  }

  /**
   * Return the fourth record.
   * Mirrors: ActiveRecord::Base.fourth
   */
  static async fourth(): Promise<Base | null> {
    return this.all().fourth();
  }

  /**
   * Return the fifth record.
   * Mirrors: ActiveRecord::Base.fifth
   */
  static async fifth(): Promise<Base | null> {
    return this.all().fifth();
  }

  /**
   * Return the forty-second record.
   * Mirrors: ActiveRecord::Base.forty_two
   */
  static async fortyTwo(): Promise<Base | null> {
    return this.all().fortyTwo();
  }

  /**
   * Return the second-to-last record.
   * Mirrors: ActiveRecord::Base.second_to_last
   */
  static async secondToLast(): Promise<Base | null> {
    return this.all().secondToLast();
  }

  /**
   * Return the third-to-last record.
   * Mirrors: ActiveRecord::Base.third_to_last
   */
  static async thirdToLast(): Promise<Base | null> {
    return this.all().thirdToLast();
  }

  /**
   * Check if a record exists. Accepts a primary key, conditions hash, or no arguments.
   *
   * Mirrors: ActiveRecord::Base.exists?
   */
  static async exists(idOrConditions?: unknown): Promise<boolean> {
    if (idOrConditions === undefined) {
      return this.all().isAny();
    }
    // Rails: exists(false) and exists(nil) always return false
    if (idOrConditions === false || idOrConditions === null) {
      return false;
    }
    if (
      typeof idOrConditions === "object" &&
      idOrConditions !== null &&
      !Array.isArray(idOrConditions)
    ) {
      return this.all()
        .where(idOrConditions as Record<string, unknown>)
        .isAny();
    }
    // Treat as primary key
    const record = await this.findBy({ [this.primaryKey as string]: idOrConditions });
    return record !== null;
  }

  /**
   * Return the count of all records.
   *
   * Mirrors: ActiveRecord::Base.count
   */
  static async count(): Promise<number> {
    return this.all().count() as Promise<number>;
  }

  /**
   * Return the minimum value of a column.
   *
   * Mirrors: ActiveRecord::Base.minimum
   */
  static async minimum(column: string): Promise<unknown> {
    return this.all().minimum(column);
  }

  /**
   * Return the maximum value of a column.
   *
   * Mirrors: ActiveRecord::Base.maximum
   */
  static async maximum(column: string): Promise<unknown> {
    return this.all().maximum(column);
  }

  /**
   * Return the average value of a column.
   *
   * Mirrors: ActiveRecord::Base.average
   */
  static async average(column: string): Promise<unknown> {
    return this.all().average(column);
  }

  /**
   * Return the sum of a column.
   *
   * Mirrors: ActiveRecord::Base.sum
   */
  static async sum(column: string): Promise<unknown> {
    return this.all().sum(column);
  }

  /**
   * Pluck column values.
   *
   * Mirrors: ActiveRecord::Base.pluck
   */
  static async pluck(...columns: string[]): Promise<unknown[]> {
    return this.all().pluck(...columns);
  }

  /**
   * Return primary key values.
   *
   * Mirrors: ActiveRecord::Base.ids
   */
  static async ids(): Promise<unknown[]> {
    return this.all().ids();
  }

  /**
   * Pick column values from the first matching record.
   *
   * Mirrors: ActiveRecord::Base.pick
   */
  static async pick(...columns: string[]): Promise<unknown> {
    return this.all().pick(...columns);
  }

  /**
   * Return the first record.
   *
   * Mirrors: ActiveRecord::Base.first
   */
  static async first(n?: number): Promise<Base | Base[] | null> {
    return this.all().first(n as any);
  }

  /**
   * Return the first record, or throw if none found.
   *
   * Mirrors: ActiveRecord::Base.first!
   */
  static async firstBang(): Promise<Base> {
    return this.all().firstBang();
  }

  /**
   * Return the last record.
   *
   * Mirrors: ActiveRecord::Base.last
   */
  static async last(n?: number): Promise<Base | Base[] | null> {
    return this.all().last(n as any);
  }

  /**
   * Return the last record, or throw if none found.
   *
   * Mirrors: ActiveRecord::Base.last!
   */
  static async lastBang(): Promise<Base> {
    return this.all().lastBang();
  }

  /**
   * Return a record without any implied ordering.
   *
   * Mirrors: ActiveRecord::Base.take
   */
  static async take(n?: number): Promise<Base | Base[] | null> {
    return this.all().take(n as any);
  }

  /**
   * Return the sole matching record, or throw.
   *
   * Mirrors: ActiveRecord::Base.sole
   */
  static async sole(): Promise<Base> {
    return this.all().sole();
  }

  /**
   * Scope: SELECT specific columns.
   *
   * Mirrors: ActiveRecord::Base.select
   */
  static select(...columns: string[]) {
    return this.all().select(...columns);
  }

  /**
   * Scope: ORDER BY.
   *
   * Mirrors: ActiveRecord::Base.order
   */
  static order(...args: Array<string | Record<string, "asc" | "desc">>) {
    return this.all().order(...args);
  }

  /**
   * Scope: GROUP BY.
   *
   * Mirrors: ActiveRecord::Base.group
   */
  static group(...columns: string[]) {
    return this.all().group(...columns);
  }

  /**
   * Scope: LIMIT.
   *
   * Mirrors: ActiveRecord::Base.limit
   */
  static limit(value: number | null) {
    return this.all().limit(value);
  }

  /**
   * Scope: OFFSET.
   *
   * Mirrors: ActiveRecord::Base.offset
   */
  static offset(value: number) {
    return this.all().offset(value);
  }

  /**
   * Scope: DISTINCT.
   *
   * Mirrors: ActiveRecord::Base.distinct
   */
  static distinct() {
    return this.all().distinct();
  }

  /**
   * Scope: JOIN.
   *
   * Mirrors: ActiveRecord::Base.joins
   */
  static joins(...args: any[]) {
    return (this.all() as any).joins(...args);
  }

  /**
   * Scope: LEFT OUTER JOIN.
   *
   * Mirrors: ActiveRecord::Base.left_joins
   */
  static leftJoins(...args: any[]) {
    return (this.all() as any).leftJoins(...args);
  }

  /**
   * Scope: add a LEFT OUTER JOIN.
   *
   * Mirrors: ActiveRecord::Base.left_outer_joins
   */
  static leftOuterJoins(...args: any[]) {
    return (this.all() as any).leftOuterJoins(...args);
  }

  /**
   * Scope: return an empty relation.
   *
   * Mirrors: ActiveRecord::Base.none
   */
  static none() {
    return this.all().none();
  }

  /**
   * Find the first record matching conditions, or create one.
   *
   * Mirrors: ActiveRecord::Base.find_or_create_by
   */
  static async findOrCreateBy(
    conditions: Record<string, unknown>,
    extra?: Record<string, unknown>,
  ): Promise<Base> {
    const record = await this.findBy(conditions);
    if (record) return record;
    return this.create({ ...conditions, ...extra });
  }

  /**
   * Find the first record matching conditions, or instantiate one (unsaved).
   *
   * Mirrors: ActiveRecord::Base.find_or_initialize_by
   */
  static async findOrInitializeBy(
    conditions: Record<string, unknown>,
    extra?: Record<string, unknown>,
  ): Promise<Base> {
    const record = await this.findBy(conditions);
    if (record) return record;
    return new this({ ...conditions, ...extra });
  }

  /**
   * Try to create a record first; if it already exists (uniqueness violation),
   * find and return the existing one.
   *
   * Mirrors: ActiveRecord::Base.create_or_find_by
   */
  static async createOrFindBy(
    conditions: Record<string, unknown>,
    extra?: Record<string, unknown>,
  ): Promise<Base> {
    try {
      return await this.create({ ...conditions, ...extra });
    } catch {
      const record = await this.findBy(conditions);
      if (record) return record;
      throw new RecordNotFound(`${this.name} not found`, this.name);
    }
  }

  /**
   * Try to create a record first (raising on validation failure);
   * if it already exists, find and return the existing one.
   *
   * Mirrors: ActiveRecord::Base.create_or_find_by!
   */
  static async createOrFindByBang(
    conditions: Record<string, unknown>,
    extra?: Record<string, unknown>,
  ): Promise<Base> {
    try {
      return await this.createBang({ ...conditions, ...extra });
    } catch (e) {
      if (e instanceof RecordInvalid) throw e;
      const record = await this.findBy(conditions);
      if (record) return record;
      throw new RecordNotFound(`${this.name} not found`, this.name);
    }
  }

  /**
   * Instantiate a new record (not yet saved).
   *
   * Mirrors: ActiveRecord::Base.new (Ruby convention)
   */
  static new(attrs: Record<string, unknown> = {}): Base {
    return new this(attrs);
  }

  /**
   * Create a record and save it to the database.
   *
   * Mirrors: ActiveRecord::Base.create
   */
  private static _mergeCurrentScopeAttrs(attrs: Record<string, unknown>): Record<string, unknown> {
    const scope = this.currentScope;
    if (scope) {
      const scopeAttrs = scope.scopeForCreate?.() ?? {};
      return { ...scopeAttrs, ...attrs };
    }
    return attrs;
  }

  static async create(attrs: Record<string, unknown> = {}): Promise<Base> {
    const record = new this(this._mergeCurrentScopeAttrs(attrs));
    await record.save();
    return record;
  }

  /**
   * Create a record or throw if validation fails.
   *
   * Mirrors: ActiveRecord::Base.create!
   */
  static async createBang(attrs: Record<string, unknown> = {}): Promise<Base> {
    const record = new this(this._mergeCurrentScopeAttrs(attrs));
    await record.saveBang();
    return record;
  }

  /**
   * Execute raw SQL and return model instances.
   *
   * Mirrors: ActiveRecord::Base.find_by_sql
   */
  static async findBySql(sql: string): Promise<Base[]> {
    const rows = await this.adapter.execute(sql);
    return rows.map((row) => this._instantiate(row));
  }

  /**
   * Increment counter columns for a record by primary key.
   *
   * Mirrors: ActiveRecord::Base.increment_counter
   */
  static async incrementCounter(
    attribute: string,
    id: unknown,
    by: number = 1,
    options?: { touch?: boolean | string | string[] },
  ): Promise<number> {
    return CounterCache.incrementCounter(this, attribute, id, by, options);
  }

  /**
   * Decrement counter columns for a record by primary key.
   *
   * Mirrors: ActiveRecord::Base.decrement_counter
   */
  static async decrementCounter(
    attribute: string,
    id: unknown,
    by: number = 1,
    options?: { touch?: boolean | string | string[] },
  ): Promise<number> {
    return CounterCache.decrementCounter(this, attribute, id, by, options);
  }

  /**
   * Update counter columns for one or more records.
   *
   * Mirrors: ActiveRecord::Base.update_counters
   */
  static async updateCounters(
    id: unknown | unknown[],
    counters: Record<string, number>,
    options?: { touch?: boolean | string | string[] },
  ): Promise<number> {
    return CounterCache.updateCounters(this, id, counters, options);
  }

  /**
   * Reset counter caches by recounting the actual associated records.
   *
   * Mirrors: ActiveRecord::Base.reset_counters
   */
  static async resetCounters(id: unknown, ...counterNames: string[]): Promise<void> {
    return CounterCache.resetCounters(this, id, ...counterNames);
  }

  /**
   * Instantiate a model from a database row (marks it as persisted).
   */
  static _instantiate(row: Record<string, unknown>): Base {
    // If STI is enabled, delegate to the correct subclass
    const stiBase = getStiBase(this);
    const inheritanceCol = getInheritanceColumn(stiBase);
    if (inheritanceCol && row[inheritanceCol] && row[inheritanceCol] !== this.name) {
      return instantiateSti(stiBase, row);
    }

    this._skipEncryption = true;
    const record = new this(row);
    this._skipEncryption = false;
    record._newRecord = false;
    (record as any)._dirty.snapshot(record._attributes);
    record.changesApplied();
    // Apply strict_loading_by_default
    if (this._strictLoadingByDefault) {
      record._strictLoading = true;
    }
    // Fire after_find callbacks
    this._callbackChain.runAfterSync("find", record);
    return record;
  }

  // -- Instance state --

  _newRecord = true;
  private _destroyed = false;
  private _readonly = false;
  private _frozen = false;
  private _previouslyNewRecord = false;
  private _destroyedByAssociation: unknown = null;
  _transactionAction: "create" | "update" | "destroy" | undefined = undefined;
  _strictLoading = false;
  _strictLoadingBypassCount = 0;
  _preloadedAssociations: Map<string, unknown> = new Map();
  _collectionProxies: Map<string, unknown> = new Map();
  _associationInstances: Map<string, AssociationInstance> = new Map();

  /**
   * Track whether we're inside _instantiate (loading from DB).
   * In that case, attributes are already encrypted in DB, skip re-encryption.
   */
  private static _skipEncryption = false;

  constructor(attrs: Record<string, unknown> = {}) {
    super(attrs);
    // Encrypt initial attribute values for encrypted attributes
    // (skip when loading from DB — values are already encrypted)
    if (!(this.constructor as typeof Base)._skipEncryption) {
      for (const [name, value] of this._attributes) {
        const enc = getEncryptor(this.constructor, name);
        if (enc && typeof value === "string") {
          this._attributes.set(name, enc.encrypt(value));
        }
      }
    }
  }

  /**
   * Returns true if the record has not been saved yet.
   *
   * Mirrors: ActiveRecord::Base#new_record?
   */
  isNewRecord(): boolean {
    return this._newRecord;
  }

  /**
   * Returns true if the record has been saved and not destroyed.
   *
   * Mirrors: ActiveRecord::Base#persisted?
   */
  isPersisted(): boolean {
    return !this._newRecord && !this._destroyed;
  }

  /**
   * Returns true if the record has been destroyed.
   *
   * Mirrors: ActiveRecord::Base#destroyed?
   */
  isDestroyed(): boolean {
    return this._destroyed;
  }

  /**
   * Returns true if the record is marked readonly.
   *
   * Mirrors: ActiveRecord::Base#readonly?
   */
  isReadonly(): boolean {
    return this._readonly;
  }

  /**
   * Mark the record as readonly. Raises on save/update/destroy.
   *
   * Mirrors: ActiveRecord::Base#readonly!
   */
  readonlyBang(): this {
    this._readonly = true;
    return this;
  }

  /**
   * Returns true if strict loading is enabled.
   *
   * Mirrors: ActiveRecord::Base#strict_loading?
   */
  isStrictLoading(): boolean {
    return this._strictLoading;
  }

  /**
   * Enable strict loading — lazily-loaded associations will raise.
   *
   * Mirrors: ActiveRecord::Base#strict_loading!
   */
  strictLoadingBang(): this {
    this._strictLoading = true;
    return this;
  }

  /**
   * Returns true if this record was a new record before the last save.
   *
   * Mirrors: ActiveRecord::Base#previously_new_record?
   */
  isPreviouslyNewRecord(): boolean {
    return this._previouslyNewRecord;
  }

  /**
   * Returns true if the record is frozen (e.g. after destroy).
   *
   * Mirrors: ActiveRecord::Base#frozen?
   */
  isFrozen(): boolean {
    return this._frozen;
  }

  /**
   * Freeze the record, preventing further modifications.
   *
   * Mirrors: ActiveRecord::Base#freeze
   */
  freeze(): this {
    this._frozen = true;
    return this;
  }

  /**
   * Get the association that triggered the destruction of this record (if any).
   *
   * Mirrors: ActiveRecord::Base#destroyed_by_association
   */
  get destroyedByAssociation(): unknown {
    return this._destroyedByAssociation;
  }

  /**
   * Set the association that triggered the destruction of this record.
   *
   * Mirrors: ActiveRecord::Base#destroyed_by_association=
   */
  set destroyedByAssociation(assoc: unknown) {
    this._destroyedByAssociation = assoc;
  }

  declare cacheKey: () => string;
  declare cacheKeyWithVersion: () => string;
  declare cacheVersion: () => string | null;

  /**
   * Override readAttribute to decrypt encrypted attributes.
   */
  readAttribute(name: string): unknown {
    const value = super.readAttribute(name);
    const enc = getEncryptor(this.constructor, name);
    if (enc && typeof value === "string") {
      try {
        return enc.decrypt(value);
      } catch {
        return value;
      }
    }
    return value;
  }

  /**
   * Override writeAttribute to prevent modifications on frozen records
   * and to encrypt encrypted attributes.
   */
  writeAttribute(name: string, value: unknown): void {
    if (!/^[\p{L}\p{N}_]+$/u.test(name)) {
      throw new DangerousAttributeError(`Invalid attribute name: ${name}`);
    }
    if (this._frozen) {
      throw new Error(`Cannot modify a frozen ${(this.constructor as typeof Base).name}`);
    }
    const enc = getEncryptor(this.constructor, name);
    if (enc && typeof value === "string") {
      super.writeAttribute(name, enc.encrypt(value));
    } else {
      super.writeAttribute(name, value);
    }
  }

  /**
   * The primary key value.
   */
  get id(): unknown {
    const ctor = this.constructor as typeof Base;
    const pk = ctor.primaryKey;
    if (Array.isArray(pk)) {
      return pk.map((col) => this.readAttribute(col));
    }
    return this.readAttribute(pk);
  }

  set id(value: unknown) {
    const ctor = this.constructor as typeof Base;
    const pk = ctor.primaryKey;
    if (Array.isArray(pk)) {
      if (!Array.isArray(value)) {
        throw new TypeError(
          `Expected an array for composite primary key [${pk.join(", ")}], got ${value === null ? "null" : typeof value}`,
        );
      }
      pk.forEach((col, i) => this.writeAttribute(col, (value as unknown[])[i]));
    } else {
      this.writeAttribute(pk, value);
    }
  }

  /**
   * Increment an attribute in memory.
   *
   * Mirrors: ActiveRecord::Base#increment
   */
  increment(attribute: string, by: number = 1): this {
    const current = Number(this.readAttribute(attribute)) || 0;
    this.writeAttribute(attribute, current + by);
    return this;
  }

  /**
   * Decrement an attribute in memory.
   *
   * Mirrors: ActiveRecord::Base#decrement
   */
  decrement(attribute: string, by: number = 1): this {
    const current = Number(this.readAttribute(attribute)) || 0;
    this.writeAttribute(attribute, current - by);
    return this;
  }

  /**
   * Toggle a boolean attribute in memory.
   *
   * Mirrors: ActiveRecord::Base#toggle
   */
  toggle(attribute: string): this {
    const current = this.readAttribute(attribute);
    this.writeAttribute(attribute, !current);
    return this;
  }

  /**
   * Increment and persist using updateColumn (skip validations).
   *
   * Mirrors: ActiveRecord::Base#increment!
   */
  async incrementBang(attribute: string, by: number = 1): Promise<this> {
    this.increment(attribute, by);
    await this.updateColumn(attribute, this.readAttribute(attribute));
    return this;
  }

  /**
   * Decrement and persist using updateColumn (skip validations).
   *
   * Mirrors: ActiveRecord::Base#decrement!
   */
  async decrementBang(attribute: string, by: number = 1): Promise<this> {
    this.decrement(attribute, by);
    await this.updateColumn(attribute, this.readAttribute(attribute));
    return this;
  }

  /**
   * Toggle and persist using updateColumn (skip validations).
   *
   * Mirrors: ActiveRecord::Base#toggle!
   */
  async toggleBang(attribute: string): Promise<this> {
    this.toggle(attribute);
    await this.updateColumn(attribute, this.readAttribute(attribute));
    return this;
  }

  /**
   * Run async validations (like uniqueness).
   */
  private async _runAsyncValidations(): Promise<boolean> {
    const ctor = this.constructor as typeof Base;
    const asyncValidators: Array<{ attribute: string; options: any }> =
      (ctor as any)._asyncValidations ?? [];

    for (const { attribute, options } of asyncValidators) {
      const value = this.readAttribute(attribute);
      if (value === null || value === undefined) continue;

      const conditions: Record<string, unknown> = { [attribute]: value };

      // Add scope columns
      if (options.scope) {
        const scopes = Array.isArray(options.scope) ? options.scope : [options.scope];
        for (const scopeCol of scopes) {
          conditions[scopeCol] = this.readAttribute(scopeCol);
        }
      }

      // Apply conditions if provided
      let relation = ctor.where(conditions);
      if (options.conditions && typeof options.conditions === "function") {
        relation = options.conditions.call(relation);
      }

      // Exclude self if persisted
      if (this.isPersisted()) {
        relation = relation.where(
          `"${ctor.arelTable.name}"."${ctor.primaryKey}" != ${(this as any).id}`,
        );
      }
      const existing = await relation.first();
      if (existing) {
        this.errors.add(attribute, "taken", { message: options.message });
      }
    }

    // Await per-instance async validation promises (pushed by UniquenessValidator.validateEach)
    const instancePromises = (this as any)._asyncValidationPromises as
      | Promise<unknown>[]
      | undefined;
    if (instancePromises?.length) {
      try {
        await Promise.all(instancePromises);
      } finally {
        (this as any)._asyncValidationPromises = [];
      }
    }

    return this.errors.empty;
  }

  /**
   * Register a uniqueness validation.
   *
   * Mirrors: validates uniqueness: true
   */
  static validatesUniqueness(
    attribute: string,
    options: { scope?: string | string[]; message?: string; conditions?: (this: any) => any } = {},
  ): void {
    if (!Object.prototype.hasOwnProperty.call(this, "_asyncValidations")) {
      (this as any)._asyncValidations = [...((this as any)._asyncValidations ?? [])];
    }
    (this as any)._asyncValidations.push({ attribute, options });
  }

  /**
   * Save the record. Returns true if successful, false if validation fails.
   * Raises if the record has been destroyed.
   *
   * Mirrors: ActiveRecord::Base#save
   */
  async save(options?: { validate?: boolean; touch?: boolean }): Promise<boolean> {
    if (this._destroyed) {
      throw new RecordNotSaved(
        `Cannot save a destroyed ${(this.constructor as typeof Base).name}`,
        this,
      );
    }
    if (this._readonly) {
      throw new ReadOnlyRecord(`${this.constructor.name} is marked as readonly`);
    }
    const shouldValidate = options?.validate !== false;
    if (shouldValidate) {
      // Set validation context for on: :create / on: :update
      this._validationContext = this._newRecord ? "create" : "update";
      if (!this.isValid()) {
        this._validationContext = null;
        return false;
      }
      this._validationContext = null;

      // Run async validations (uniqueness)
      if (!(await this._runAsyncValidations())) return false;
    }

    this._skipTouch = options?.touch === false;
    const ctor = this.constructor as typeof Base;

    // Auto-set STI type column on new records
    if (this._newRecord && isStiSubclass(ctor)) {
      const col = getInheritanceColumn(getStiBase(ctor));
      if (col && !this.readAttribute(col)) {
        this._attributes.set(col, ctor.name);
      }
    }

    // Check if we have autosave associations — if so, wrap in transaction
    // so failures in autosave roll back the parent's INSERT/UPDATE.
    const { autosaveBelongsTo, autosaveChildren } = await import("./autosave-association.js");
    const associations: any[] = (ctor as any)._associations ?? [];
    const hasAutosave = associations.some((a: any) => a.options?.autosave);

    const saveBody = async (): Promise<boolean> => {
      let saved = false;
      this._transactionAction = undefined;
      if (!(await ctor._callbackChain.runBefore("save", this))) return false;

      const belongsToOk = await autosaveBelongsTo(this);
      if (!belongsToOk) {
        this._skipTouch = false;
        return false;
      }

      const wasNewRecord = this._newRecord;
      if (this._newRecord) {
        const createResult = await ctor._callbackChain.run("create", this, async () => {
          this._performInsert();
          if (this._pendingOperation) {
            await this._pendingOperation;
            this._pendingOperation = null;
          }
          this._previouslyNewRecord = true;
          this._newRecord = false;
          this.changesApplied();
          saved = true;
        });
        if (!createResult) saved = false;
      } else {
        const updateResult = await ctor._callbackChain.run("update", this, async () => {
          this._performUpdate();
          if (this._pendingOperation) {
            await this._pendingOperation;
            this._pendingOperation = null;
          }
          this._previouslyNewRecord = false;
          this.changesApplied();
          saved = true;
        });
        if (!updateResult) saved = false;
      }
      this._skipTouch = false;

      if (saved) {
        // Set transaction action early so rollback callbacks have correct context
        this._transactionAction = wasNewRecord ? "create" : "update";

        await ctor._callbackChain.runAfter("save", this);

        if (wasNewRecord) {
          const { updateCounterCaches } = await import("./associations.js");
          await updateCounterCaches(this, "increment");
        }

        const autosaveOk = await autosaveChildren(this);
        if (!autosaveOk) return false;

        const { touchBelongsToParents } = await import("./associations.js");
        await touchBelongsToParents(this);
      }

      return saved;
    };

    let saved: boolean;
    if (hasAutosave) {
      const { Rollback } = await import("./transactions.js");
      const txResult = await this.transaction(async () => {
        const result = await saveBody();
        if (!result) throw new Rollback();
        return result;
      });
      saved = txResult ?? false;
    } else {
      saved = await saveBody();
    }

    // Fire after_commit/after_rollback callbacks.
    // If inside an outer transaction, defer. Otherwise fire immediately.
    const { currentTransaction } = await import("./transactions.js");
    const outerTx = currentTransaction();
    if (saved) {
      if (outerTx) {
        outerTx.afterCommit(async () => {
          await ctor._callbackChain.runAfter("commit", this);
        });
        outerTx.afterRollback(async () => {
          await ctor._callbackChain.runAfter("rollback", this);
        });
      } else {
        await ctor._callbackChain.runAfter("commit", this);
      }
    } else if (hasAutosave) {
      // Transaction was rolled back — fire after_rollback
      if (outerTx) {
        outerTx.afterRollback(async () => {
          await ctor._callbackChain.runAfter("rollback", this);
        });
      } else {
        await ctor._callbackChain.runAfter("rollback", this);
      }
    }

    return saved;
  }

  /**
   * Save the record or throw if validation fails.
   *
   * Mirrors: ActiveRecord::Base#save!
   */
  async saveBang(): Promise<true> {
    const result = await this.save();
    if (!result) {
      throw new RecordInvalid(this);
    }
    return true;
  }

  private _pendingOperation: Promise<void> | null = null;
  private _skipTouch = false;

  private _performInsert(): void {
    const ctor = this.constructor as typeof Base;

    // If suppressed, skip the actual insert but update record state
    if (_isSuppressed(ctor)) {
      this._newRecord = false;
      (this as any)._dirty.snapshot(this._attributes);
      this.changesApplied();
      return;
    }

    const table = ctor.arelTable;

    // Auto-populate timestamps (unless touch: false)
    if (!this._skipTouch) {
      const now = new Date();
      if (
        ctor._attributeDefinitions.has("created_at") &&
        this.readAttribute("created_at") === null
      ) {
        this._attributes.set("created_at", now);
      }
      if (
        ctor._attributeDefinitions.has("updated_at") &&
        this.readAttribute("updated_at") === null
      ) {
        this._attributes.set("updated_at", now);
      }
    }

    const attrs = this.attributes;
    const columns: string[] = [];
    const values: unknown[] = [];

    const pkCols = Array.isArray(ctor.primaryKey) ? ctor.primaryKey : [ctor.primaryKey];
    for (const [key, value] of Object.entries(attrs)) {
      if (pkCols.includes(key) && value === null) continue;
      columns.push(key);
      values.push(value);
    }

    let sql: string;
    if (columns.length === 0) {
      // PG supports DEFAULT VALUES, MySQL/SQLite need () VALUES ()
      sql = process.env.MYSQL_TEST_URL
        ? `INSERT INTO "${table.name}" () VALUES ()`
        : `INSERT INTO "${table.name}" DEFAULT VALUES`;
    } else {
      const im = new InsertManager(table);
      const insertValues: [InstanceType<typeof Nodes.Node>, unknown][] = columns.map((c, i) => {
        const def = ctor._attributeDefinitions.get(c);
        const isArray = def?.type?.name === "array";
        const val = isArray ? arelSql(quoteSqlValue(values[i], true)) : values[i];
        return [table.get(c), val];
      });
      im.insert(insertValues);
      sql = im.toSql();
    }
    this._pendingOperation = ctor.adapter.executeMutation(sql).then((insertedId) => {
      if (!Array.isArray(ctor.primaryKey) && this.id === null) {
        this._attributes.set(ctor.primaryKey, insertedId);
      }
    });
  }

  private _performUpdate(): void {
    const ctor = this.constructor as typeof Base;

    // If suppressed, skip the actual update
    if (_isSuppressed(ctor)) {
      (this as any)._dirty.snapshot(this._attributes);
      this.changesApplied();
      return;
    }

    const table = ctor.arelTable;

    // Auto-populate updated_at timestamp (unless touch: false)
    if (!this._skipTouch && ctor._attributeDefinitions.has("updated_at")) {
      this.writeAttribute("updated_at", new Date());
    }

    // Filter out readonly attributes from changes (they can only be set on create)
    const changedAttrs = { ...this.changes };
    for (const readonlyAttr of ctor._readonlyAttributes) {
      delete changedAttrs[readonlyAttr];
    }

    if (Object.keys(changedAttrs).length === 0) return;

    const updateValues: [InstanceType<typeof Nodes.Node>, unknown][] = Object.keys(
      changedAttrs,
    ).map((key) => {
      const val = this.readAttribute(key);
      const def = ctor._attributeDefinitions.get(key);
      const isArray = def?.type?.name === "array";
      return [table.get(key), isArray ? arelSql(quoteSqlValue(val, true)) : val];
    });

    // Optimistic locking: include lock column in WHERE and increment it
    const lockCol = ctor.lockingColumn;
    let rawVersion: unknown;
    if (ctor.lockingEnabled) {
      rawVersion = this.readAttribute(lockCol);
      const currentVersion = rawVersion == null ? 0 : Number(rawVersion) || 0;
      this._attributes.set(lockCol, currentVersion + 1);
      updateValues.push([table.get(lockCol), currentVersion + 1]);
    }

    const um = new UpdateManager()
      .table(table)
      .set(updateValues)
      .where(ctor._buildPkWhereNode(this.id));
    if (ctor.lockingEnabled) {
      if (rawVersion == null) {
        um.where(table.get(lockCol).isNull());
      } else {
        um.where(table.get(lockCol).eq(Number(rawVersion) || 0));
      }
    }

    this._pendingOperation = ctor.adapter.executeMutation(um.toSql()).then((affected) => {
      if (ctor.lockingEnabled && affected === 0) {
        throw new StaleObjectError(this, "update");
      }
    });
  }

  /**
   * Update attributes and save.
   *
   * Mirrors: ActiveRecord::Base#update
   */
  async update(attrs: Record<string, unknown>): Promise<boolean> {
    const ctor = this.constructor as typeof Base;
    const lockCol = ctor.lockingColumn;
    if (Object.hasOwn(attrs, lockCol) && ctor.lockingEnabled) {
      throw new Error(`${lockCol} cannot be updated explicitly`);
    }
    for (const [key, value] of Object.entries(attrs)) {
      this.writeAttribute(key, value);
    }
    return this.save();
  }

  /**
   * Update attributes and save, or throw on validation failure.
   *
   * Mirrors: ActiveRecord::Base#update!
   */
  async updateBang(attrs: Record<string, unknown>): Promise<true> {
    const ctor = this.constructor as typeof Base;
    const lockCol = ctor.lockingColumn;
    if (Object.hasOwn(attrs, lockCol) && ctor.lockingEnabled) {
      throw new Error(`${lockCol} cannot be updated explicitly`);
    }
    for (const [key, value] of Object.entries(attrs)) {
      this.writeAttribute(key, value);
    }
    return this.saveBang();
  }

  /**
   * Destroy the record. Returns `false` if a beforeDestroy callback
   * halts the chain, otherwise returns the destroyed record.
   *
   * Mirrors: ActiveRecord::Base#destroy
   */
  async destroy(): Promise<this | false> {
    if (this._readonly) {
      throw new ReadOnlyRecord(`${this.constructor.name} is marked as readonly`);
    }
    const ctor = this.constructor as typeof Base;

    let didDelete = false;
    const halted = !(await ctor._callbackChain.run("destroy", this, async () => {
      const { processDependentAssociations } = await import("./associations.js");
      await processDependentAssociations(this);

      const table = ctor.arelTable;
      const pk = this.id;
      if (!(Array.isArray(pk) ? pk.every((v) => v == null) : pk == null)) {
        const dm = new DeleteManager().from(table).where(ctor._buildPkWhereNode(pk));
        const lockCol = ctor.lockingColumn;
        if (ctor.lockingEnabled) {
          const currentVersion = this.readAttribute(lockCol);
          if (currentVersion == null) {
            dm.where(table.get(lockCol).isNull());
          } else {
            dm.where(table.get(lockCol).eq(Number(currentVersion) || 0));
          }
        }

        const affected = await ctor.adapter.executeMutation(dm.toSql());
        if (ctor.lockingEnabled && affected === 0) {
          throw new StaleObjectError(this, "destroy");
        }
        didDelete = affected > 0;
      }

      this._destroyed = true;
      this._frozen = true;
      this._collectionProxies.clear();
      this._preloadedAssociations.clear();
      this._associationInstances.clear();
    }));

    if (halted) return false;

    if (didDelete) {
      const { updateCounterCaches, touchBelongsToParents } = await import("./associations.js");
      await updateCounterCaches(this, "decrement");
      await touchBelongsToParents(this);

      this._transactionAction = "destroy";
      const { currentTransaction } = await import("./transactions.js");
      const tx = currentTransaction();
      if (tx) {
        tx.afterCommit(async () => {
          await ctor._callbackChain.runAfter("commit", this);
        });
        tx.afterRollback(async () => {
          await ctor._callbackChain.runAfter("rollback", this);
        });
      } else {
        await ctor._callbackChain.runAfter("commit", this);
      }
    }

    return this;
  }

  /**
   * Destroy the record or throw.
   *
   * Mirrors: ActiveRecord::Base#destroy!
   */
  async destroyBang(): Promise<this> {
    const result = await this.destroy();
    if (result === false) {
      throw new RecordNotDestroyed("Failed to destroy the record", this);
    }
    return result;
  }

  /**
   * Delete the record from the database without running callbacks.
   *
   * Mirrors: ActiveRecord::Base#delete
   */
  async delete(): Promise<this> {
    const ctor = this.constructor as typeof Base;
    const table = ctor.arelTable;
    const pk = this.id;

    if (Array.isArray(pk) ? pk.every((v) => v == null) : pk == null) {
      // New (unpersisted) record — nothing to delete
      this._destroyed = true;
      return this;
    }

    const dm = new DeleteManager().from(table).where(ctor._buildPkWhereNode(pk));
    await ctor.adapter.executeMutation(dm.toSql());

    this._destroyed = true;
    this._frozen = true;
    return this;
  }

  /**
   * Delete a record by primary key without callbacks.
   *
   * Mirrors: ActiveRecord::Base.delete
   */
  static async delete(id: unknown): Promise<number> {
    const dm = new DeleteManager().from(this.arelTable).where(this._buildPkWhereNode(id));
    return this.adapter.executeMutation(dm.toSql());
  }

  /**
   * Reload the record from the database.
   *
   * Mirrors: ActiveRecord::Base#reload
   */
  async reload(): Promise<this> {
    const ctor = this.constructor as typeof Base;
    const sm = ctor.arelTable.project(arelStar).where(ctor._buildPkWhereNode(this.id));
    const row = await ctor.adapter.execute(sm.toSql());

    if (row.length === 0) {
      throw new RecordNotFound(
        `${ctor.name} with ${ctor.primaryKey}=${this.id} not found`,
        ctor.name,
        String(ctor.primaryKey),
        this.id,
      );
    }

    for (const [key, value] of Object.entries(row[0])) {
      this._attributes.set(key, value);
    }

    (this as any)._dirty.snapshot(this._attributes);
    this._collectionProxies.clear();
    this._preloadedAssociations.clear();
    this._associationInstances.clear();
    return this;
  }

  /**
   * Reload the record with a pessimistic lock (SELECT ... FOR UPDATE).
   *
   * Mirrors: ActiveRecord::Base#lock!
   */
  async lockBang(lockClause: string = "FOR UPDATE"): Promise<this> {
    await LockingPessimistic.lockBang(this, lockClause);
    return this;
  }

  async withLock(lock: string, fn: (record: this) => Promise<void> | void): Promise<void>;
  async withLock(fn: (record: this) => Promise<void> | void): Promise<void>;
  async withLock(
    lockOrFn?: string | ((record: this) => Promise<void> | void),
    fn?: (record: this) => Promise<void> | void,
  ): Promise<void> {
    return LockingPessimistic.withLock(this, lockOrFn as any, fn as any);
  }

  declare toParam: () => string | null;

  declare inspect: () => string;
  declare attributeForInspect: (attr: string) => string;

  /**
   * Returns true if the record has changes, is new, or is marked for destruction.
   *
   * Mirrors: ActiveRecord::AutosaveAssociation#changed_for_autosave?
   */
  isChangedForAutosave(): boolean {
    return this.isNewRecord() || this.changed || this._destroyed;
  }

  /**
   * Return a subset of the record's attributes as a plain object.
   *
   * Mirrors: ActiveRecord::Base#slice
   */
  slice(...keys: string[]): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const key of keys) {
      result[key] = this.readAttribute(key);
    }
    return result;
  }

  /**
   * Return a GlobalID-like URI for this record.
   *
   * Mirrors: ActiveRecord::Base#to_gid (simplified, no app name)
   */
  toGid(): string {
    const ctor = this.constructor as typeof Base;
    return `gid://${ctor.name}/${this.id}`;
  }

  /**
   * Return a signed GlobalID-like URI for this record.
   * Uses a simple base64 encoding (not cryptographically signed).
   *
   * Mirrors: ActiveRecord::Base#to_sgid (simplified)
   */
  toSgid(): string {
    const gid = this.toGid();
    if (typeof btoa === "function") {
      return btoa(gid);
    }
    return Buffer.from(gid).toString("base64");
  }

  /**
   * Return attribute values for the given keys as an array.
   *
   * Mirrors: ActiveRecord::Base#values_at
   */
  valuesAt(...keys: string[]): unknown[] {
    return keys.map((key) => this.readAttribute(key));
  }

  /**
   * Assign attributes without saving.
   *
   * Mirrors: ActiveRecord::Base#assign_attributes
   */
  assignAttributes(attrs: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(attrs)) {
      try {
        this.writeAttribute(key, value);
      } catch (e) {
        let repr: string;
        try {
          repr = JSON.stringify(value);
        } catch {
          repr = String(value);
        }
        throw new AttributeAssignmentError(
          `error on assignment ${repr} to ${key} (${e instanceof Error ? e.message : String(e)})`,
          e instanceof Error ? e : undefined,
          key,
        );
      }
    }
  }

  /**
   * Update the updated_at timestamp (and optionally other timestamp
   * columns) without changing other attributes. Skips validations
   * and callbacks.
   *
   * Mirrors: ActiveRecord::Base#touch
   */
  async touch(...names: string[]): Promise<boolean> {
    return Timestamp.touch(this, ...names);
  }

  /**
   * Update a single attribute and save, skipping validations.
   * Runs callbacks, unlike updateColumn.
   *
   * Mirrors: ActiveRecord::Base#update_attribute
   */
  async updateAttribute(name: string, value: unknown): Promise<boolean> {
    this.writeAttribute(name, value);
    return this.save({ validate: false });
  }

  /**
   * Update a single column directly in the database, skipping
   * validations and callbacks.
   *
   * Mirrors: ActiveRecord::Base#update_column
   */
  async updateColumn(name: string, value: unknown): Promise<void> {
    return this.updateColumns({ [name]: value });
  }

  /**
   * Update multiple columns directly in the database, skipping
   * validations and callbacks.
   *
   * Mirrors: ActiveRecord::Base#update_columns
   */
  async updateColumns(attrs: Record<string, unknown>): Promise<void> {
    if (this._readonly) throw new ReadOnlyRecord(`${this.constructor.name} is marked as readonly`);
    if (!this.isPersisted()) {
      throw new Error("Cannot update columns on a new or destroyed record");
    }

    const ctor = this.constructor as typeof Base;
    const table = ctor.arelTable;

    // Set attributes directly (no dirty tracking through writeAttribute)
    for (const [key, value] of Object.entries(attrs)) {
      const def = ctor._attributeDefinitions.get(key);
      this._attributes.set(key, def ? def.type.cast(value) : value);
    }

    const setClauses = Object.entries(attrs)
      .map(([key, _]) => {
        const val = this._attributes.get(key);
        if (val === null) return `"${key}" = NULL`;
        if (typeof val === "number") return `"${key}" = ${val}`;
        if (typeof val === "boolean") return `"${key}" = ${val ? "TRUE" : "FALSE"}`;
        if (val instanceof Date) return `"${key}" = '${val.toISOString()}'`;
        if (typeof val === "object")
          return `"${key}" = '${JSON.stringify(val).replace(/'/g, "''")}'`;
        return `"${key}" = '${String(val).replace(/'/g, "''")}'`;
      })
      .join(", ");

    const sql = `UPDATE "${table.name}" SET ${setClauses} WHERE ${ctor._buildPkWhere(this.id)}`;
    await ctor.adapter.executeMutation(sql);

    // Reset dirty tracking to reflect the new persisted state
    this.changesApplied();
  }

  /**
   * Create an unsaved duplicate of this record (new_record = true, no id).
   *
   * Mirrors: ActiveRecord::Base#dup
   */
  dup(): Base {
    const ctor = this.constructor as typeof Base;
    const attrs = { ...this.attributes };
    const pkCols = Array.isArray(ctor.primaryKey) ? ctor.primaryKey : [ctor.primaryKey];
    for (const col of pkCols) {
      delete attrs[col]; // Remove PK so it's a new record
    }
    const copy = new ctor(attrs);
    return copy;
  }

  /**
   * Shallow clone preserving the primary key and persisted state.
   *
   * Mirrors: ActiveRecord::Core#clone
   */
  clone(): Base {
    const copy = Object.create(Object.getPrototypeOf(this)) as Base;
    Object.assign(copy, this);
    copy._attributes = this._attributes;
    copy._previouslyNewRecord = false;
    copy.errors = new (this.errors.constructor as new (base: unknown) => typeof this.errors)(copy);
    return copy;
  }

  /**
   * Returns an instance of the specified class with the attributes of this record.
   *
   * Mirrors: ActiveRecord::Base#becomes
   */
  becomes(klass: typeof Base): Base {
    const instance = new klass({});
    // Share the same attributes map (Rails behavior)
    instance._attributes = this._attributes;
    instance._newRecord = this._newRecord;
    if (!this._newRecord) {
      (instance as any)._dirty.snapshot(instance._attributes);
      instance.changesApplied();
    }
    return instance;
  }

  declare hasAttribute: (name: string) => boolean;
  declare attributePresent: (name: string) => boolean;
  declare toKey: () => unknown[] | null;
  declare accessedFields: () => string[];

  get attributeNamesList(): string[] {
    return _attributeNamesList.call(this as any);
  }

  /**
   * Returns the list of attribute names.
   *
   * Mirrors: ActiveRecord::Base.attribute_names
   */
  static attributeNames(): string[] {
    return [...this._attributeDefinitions.keys()];
  }

  /**
   * Return a hash of attribute name to default value.
   *
   * Mirrors: ActiveRecord::Base.column_defaults
   */
  static get columnDefaults(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [name, def] of this._attributeDefinitions) {
      result[name] =
        typeof def.defaultValue === "function" ? def.defaultValue() : (def.defaultValue ?? null);
    }
    return result;
  }

  /**
   * Return a hash of attribute name to type object.
   *
   * Mirrors: ActiveRecord::Base.attribute_types
   */
  static get attributeTypes(): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [name, def] of this._attributeDefinitions) {
      result[name] = def.type;
    }
    return result;
  }

  // -- Strict loading class-level default --
  static _strictLoadingByDefault = false;

  /**
   * When true, all records loaded from this model will have strict_loading enabled.
   *
   * Mirrors: ActiveRecord::Base.strict_loading_by_default
   */
  static get strictLoadingByDefault(): boolean {
    return this._strictLoadingByDefault;
  }

  static set strictLoadingByDefault(value: boolean) {
    this._strictLoadingByDefault = value;
  }

  /**
   * Generate a signed ID for this record using HMAC-SHA256 via MessageVerifier.
   * The purpose parameter scopes the signed ID. expiresIn is in seconds.
   *
   * Mirrors: ActiveRecord::SignedId#signed_id
   */
  signedId(options?: { purpose?: string; expiresIn?: number; expiresAt?: Date }): string {
    return SignedIdModule.signedId(this, options);
  }

  /**
   * Find a record by its signed ID, or return null.
   *
   * Mirrors: ActiveRecord::SignedId.find_signed
   */
  static async findSigned(signedId: string, options?: { purpose?: string }): Promise<Base | null> {
    return SignedIdModule.findSigned(this, signedId, options);
  }

  /**
   * Find a record by its signed ID, or throw.
   * Throws InvalidSignature if tampered/expired, RecordNotFound if not found.
   *
   * Mirrors: ActiveRecord::SignedId.find_signed!
   */
  static async findSignedBang(signedId: string, options?: { purpose?: string }): Promise<Base> {
    return SignedIdModule.findSignedBang(this, signedId, options);
  }

  /**
   * Compare two records for equality based on class and primary key.
   *
   * Mirrors: ActiveRecord::Core#==
   */
  declare isEqual: (other: unknown) => boolean;

  /**
   * Return a string suitable for use as a URL slug.
   * Override in subclasses for friendly URLs.
   *
   * Mirrors: ActiveRecord::Base#to_param
   */
  toSlug(): string | null {
    return this.toParam();
  }

  static sanitizeSqlArray(template: string, ...binds: unknown[]): string {
    return sanitizeSqlArray(template, ...binds);
  }

  static sanitizeSql(input: string | [string, ...unknown[]]): string {
    if (typeof input === "string") return input;
    const [template, ...binds] = input;
    return this.sanitizeSqlArray(template, ...binds);
  }

  static sanitizeSqlLike(value: string, escapeChar: string = "\\"): string {
    return sanitizeSqlLike(value, escapeChar);
  }

  /**
   * Returns true if the record was previously persisted but is now destroyed.
   *
   * Mirrors: ActiveRecord::Base#previously_persisted?
   */
  isPreviouslyPersisted(): boolean {
    return !this._newRecord && this._destroyed;
  }

  /**
   * Re-instantiate as the given class, raising on failure.
   *
   * Mirrors: ActiveRecord::Base#becomes!
   */
  becomesBang(klass: typeof Base): Base {
    const instance = this.becomes(klass);
    // Set the STI type column — find it from the base class
    const base = getStiBase(klass);
    const inheritanceCol = getInheritanceColumn(base);
    if (inheritanceCol) {
      // For the base class itself, set to null; for subclasses, set to class name
      const value = isStiSubclass(klass) ? klass.name : null;
      instance._attributes.set(inheritanceCol, value);
    }
    return instance;
  }

  /**
   * Update a single attribute and save, raising on validation failure.
   *
   * Mirrors: ActiveRecord::Base#update_attribute!
   */
  async updateAttributeBang(name: string, value: unknown): Promise<true> {
    this.writeAttribute(name, value);
    return this.saveBang();
  }

  /**
   * Instance-level transaction wrapper.
   *
   * Mirrors: ActiveRecord::Base#transaction
   */
  async transaction<R>(fn: (tx: any) => Promise<R>): Promise<R | undefined> {
    const { transaction: txn } = await import("./transactions.js");
    return txn(this.constructor as typeof Base, fn);
  }

  /**
   * Run validations and return self.
   *
   * Mirrors: ActiveRecord::Validations#validate
   */
  /**
   * Check if this record passes all validations.
   *
   * Mirrors: ActiveRecord::Validations#valid?
   */
  override isValid(context?: string): boolean {
    const effectiveContext = context ?? this._validationContext ?? undefined;
    const result = super.isValid(effectiveContext);
    if (_validateAssociationsFn) {
      _validateAssociationsFn(this, effectiveContext);
    }
    return result && !this.errors.any;
  }

  validate(context?: string): this {
    this.isValid(context);
    return this;
  }

  declare isPresent: () => boolean;
  declare isBlank: () => boolean;

  equals(other: unknown): boolean {
    return this.isEqual(other);
  }

  /**
   * Return the association object for the given name.
   *
   * Mirrors: ActiveRecord::Base#association
   */
  association(name: string): AssociationInstance {
    const existing = this._associationInstances.get(name);
    if (existing) {
      this._syncAssociationInstance(name, existing);
      return existing;
    }

    const ctor = this.constructor as any;
    const associations: any[] = ctor._associations ?? [];
    const assocDef = associations.find((a: any) => a.name === name);
    if (!assocDef) {
      throw new AssociationNotFoundError(this, name);
    }

    const instance = this._buildAssociationInstance(assocDef);
    this._syncAssociationInstance(name, instance);
    this._associationInstances.set(name, instance);
    return instance;
  }

  private _buildAssociationInstance(assocDef: any): AssociationInstance {
    const opts = assocDef.options ?? {};
    switch (assocDef.type) {
      case "belongsTo":
        if (opts.polymorphic) {
          return new BelongsToPolymorphicAssociation(this, assocDef);
        }
        return new BelongsToAssociation(this, assocDef);
      case "hasOne":
        if (opts.through) {
          return new HasOneThroughAssociation(this, assocDef);
        }
        return new HasOneAssociation(this, assocDef);
      case "hasMany":
        if (opts.through) {
          return new HasManyThroughAssociation(this, assocDef);
        }
        return new HasManyAssociation(this, assocDef);
      case "hasAndBelongsToMany":
        return new HasManyThroughAssociation(this, assocDef);
      default:
        return new AssociationInstance(this, assocDef);
    }
  }

  private _syncAssociationInstance(name: string, instance: AssociationInstance): void {
    const proxy = this._collectionProxies.get(name) as any;
    if (proxy && proxy.loaded) {
      instance.setTarget(proxy.target);
    } else {
      const cachedAssociation = (this as any)._cachedAssociations?.get(name);
      if (cachedAssociation !== undefined) {
        instance.setTarget(cachedAssociation as any);
      } else {
        const preloaded = this._preloadedAssociations?.get(name) ?? null;
        if (preloaded !== null) {
          instance.setTarget(preloaded as any);
        }
      }
    }
  }

  // Underscore aliases for bang methods (Rails uses ! suffix, TS uses _ suffix)
  static async first_(): Promise<Base> {
    return (this as any).firstBang();
  }
  static async last_(): Promise<Base> {
    return (this as any).lastBang();
  }
  static async take_(): Promise<Base> {
    const r = await (this as any).all().take();
    if (!r)
      throw new RecordNotFound(
        `${(this as any).name} record not found`,
        (this as any).name,
        (this as any).primaryKey,
        null,
      );
    return r;
  }
  static async findBy_(conditions: Record<string, unknown>): Promise<Base> {
    return (this as any).findByBang(conditions);
  }

  previouslyNewRecord(): boolean {
    return this.isPreviouslyNewRecord();
  }

  static async tableExists(): Promise<boolean> {
    return true; // TODO: query adapter for table existence
  }

  static hasAttribute(name: string): boolean {
    return this.hasAttributeDefinition(name);
  }
}

// ---------------------------------------------------------------------------
// Mixin: attach extracted module functions directly to Base.prototype.
// This is the TS equivalent of Ruby's `include Module` — the real
// implementation lives in the module file, Base just wires it up.
// Uses defineProperty to match class method behavior (non-enumerable).
// ---------------------------------------------------------------------------

function mixin(target: object, methods: Record<string, Function>): void {
  for (const [name, fn] of Object.entries(methods)) {
    Object.defineProperty(target, name, {
      value: fn,
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }
}

mixin(Base.prototype, {
  // Core
  inspect: _inspect,
  attributeForInspect: _attributeForInspect,
  isEqual: _isEqual,
  isPresent: _isPresent,
  isBlank: _isBlank,
  // Integration
  toParam: _toParam,
  cacheKey: _cacheKey,
  cacheKeyWithVersion: _cacheKeyWithVersion,
  cacheVersion: _cacheVersion,
  // AttributeMethods
  hasAttribute: _hasAttribute,
  attributePresent: _attributePresent,
  accessedFields: _accessedFields,
  // PrimaryKey
  toKey: _toKey,
});
