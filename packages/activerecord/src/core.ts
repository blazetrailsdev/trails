/**
 * Core behavior mixed into every ActiveRecord model.
 *
 * Mirrors: ActiveRecord::Core
 */

import { NotImplementedError } from "./errors.js";
import { Notifications, getAsyncContext } from "@blazetrails/activesupport";
import type { AsyncContext } from "@blazetrails/activesupport";
import { PredicateBuilder } from "./relation/predicate-builder.js";
import { argumentError } from "./relation/query-methods.js";
import { formatForInspect } from "./attribute-inspection.js";

/**
 * The Core module interface — methods mixed into every AR model.
 *
 * Mirrors: ActiveRecord::Core
 */
export interface Core {
  inspect(): string;
  attributeForInspect(attr: string): string;
  isEqual(other: unknown): boolean;
  isPresent(): boolean;
  isBlank(): boolean;
  isReadonly(): boolean;
  readonlyBang(): this;
  isStrictLoading(): boolean;
  strictLoadingBang(value?: boolean, options?: { mode?: StrictLoadingMode }): this;
  strictLoadingMode(): StrictLoadingMode | null;
  isStrictLoadingAll(): boolean;
  isStrictLoadingNPlusOneOnly(): boolean;
  isFrozen(): boolean;
  freeze(): this;
}

// InspectionMask and inspectionFilter live in attribute-inspection.ts.
// Re-export so existing importers of core.ts keep working.
export { InspectionMask, inspectionFilter } from "./attribute-inspection.js";

// ---------------------------------------------------------------------------
// Instance-level behavior
// ---------------------------------------------------------------------------

interface CoreRecord {
  id: unknown;
  _attributes: Iterable<[string, unknown]>;
  _newRecord: boolean;
  readAttribute(name: string): unknown;
  isPersisted(): boolean;
}

/**
 * Return a human-readable string representation of a record.
 *
 * Mirrors: ActiveRecord::Core#inspect
 */
export function inspect(this: CoreRecord): string {
  const ctor = this.constructor as { name: string };
  // Rails: inspect builds attribute strings via format_for_inspect (same as attribute_for_inspect)
  const attrs = Array.from(this._attributes)
    .map(([k, v]) => `${k}: ${formatForInspect.call(this, k, v)}`)
    .join(", ");
  return `#<${ctor.name} ${attrs}>`;
}

/**
 * Format a single attribute value for display in inspect output.
 *
 * Mirrors: ActiveRecord::Core#attribute_for_inspect
 */
export function attributeForInspect(this: CoreRecord, attr: string): string {
  const raw = this.readAttribute(attr);
  // Rails: attribute_for_inspect calls format_for_inspect(attr_name, value)
  return formatForInspect.call(this, attr, raw);
}

/**
 * Compare two records for equality by class and primary key.
 *
 * Mirrors: ActiveRecord::Core#==
 */
export function isEqual(this: CoreRecord, other: unknown): boolean {
  if (other === null || other === undefined) return false;
  if (typeof other !== "object") return false;
  if (!(other instanceof (this.constructor as any))) return false;
  if (this.constructor !== (other as any).constructor) return false;
  const thisId = this.id;
  const otherId = (other as CoreRecord).id;
  return thisId != null && thisId === otherId;
}

/**
 * Check if this record is present (persisted and not destroyed).
 *
 * Mirrors: ActiveRecord::Core#present?
 */
export function isPresent(this: CoreRecord): boolean {
  return this.isPersisted();
}

/**
 * Check if this record is blank (new record or destroyed).
 *
 * Mirrors: ActiveRecord::Core#blank?
 */
export function isBlank(this: CoreRecord): boolean {
  return !isPresent.call(this);
}

// ---------------------------------------------------------------------------
// Readonly / strict-loading / freeze instance predicates and setters.
// Mirrors the corresponding defs in activerecord/lib/active_record/core.rb.
// ---------------------------------------------------------------------------

interface ReadonlyFields {
  _readonly: boolean;
}

interface StrictLoadingFields {
  _strictLoading: boolean;
  _strictLoadingMode?: StrictLoadingMode;
}

export type StrictLoadingMode = "all" | "n_plus_one_only";

interface FrozenRecord {
  _attributes: import("@blazetrails/activemodel").AttributeSet;
}

/** Mirrors: ActiveRecord::Core#readonly? */
export function isReadonly(this: ReadonlyFields): boolean {
  return this._readonly;
}

/** Mirrors: ActiveRecord::Core#readonly! */
export function readonlyBang<T extends ReadonlyFields>(this: T): T {
  this._readonly = true;
  return this;
}

/** Mirrors: ActiveRecord::Core#strict_loading? */
export function isStrictLoading(this: StrictLoadingFields): boolean {
  return this._strictLoading;
}

/**
 * Enable (or disable with `value: false`) strict loading on this record.
 * An optional `mode` selects strictness: "all" (default, raises on any
 * lazily-loaded association) or "n_plus_one_only" (only raises on
 * associations that would lead to N+1 queries).
 *
 * Mirrors: ActiveRecord::Core#strict_loading!
 */
export function strictLoadingBang<T extends StrictLoadingFields>(
  this: T,
  value: boolean = true,
  options: { mode?: StrictLoadingMode } = {},
): T {
  const mode = options.mode ?? "all";
  if (mode !== "all" && mode !== "n_plus_one_only") {
    // Rails: `raise ArgumentError, "The :mode option must be one of ..."`
    throw argumentError(
      `The :mode option must be one of ["all", "n_plus_one_only"] but ${JSON.stringify(mode)} was provided.`,
    );
  }
  this._strictLoadingMode = mode;
  this._strictLoading = value;
  return this;
}

/**
 * Returns true if this record's attribute set has been frozen.
 *
 * Mirrors: ActiveRecord::Core#frozen? — `@attributes.frozen?` in Rails.
 */
export function isFrozen(this: FrozenRecord): boolean {
  return this._attributes.isFrozen();
}

/**
 * Clone and freeze the attribute set. Subsequent writes to `_attributes`
 * (e.g. `writeAttribute`, `writeFromUser`) raise. Associations remain
 * accessible since they aren't stored in the attribute set. The clone
 * step ensures records sharing an attribute reference (e.g. via
 * `clone()` / `becomes`) aren't accidentally frozen together.
 *
 * Mirrors: ActiveRecord::Core#freeze — `@attributes = @attributes.clone.freeze; self` in Rails.
 */
export function freeze<T extends FrozenRecord>(this: T): T {
  this._attributes = this._attributes.deepDup().freeze();
  return this;
}

// ---------------------------------------------------------------------------
// Instance methods missing from api:compare
// ---------------------------------------------------------------------------

export function initWithAttributes(
  this: CoreRecord & { _attributes: any; _newRecord: boolean },
  attributes: any,
  newRecord = false,
): void {
  this._newRecord = newRecord;
  this._attributes = attributes;
}

export function initAttributes(
  this: CoreRecord & { _attributes: any; constructor: { primaryKey?: string | string[] } },
): void {
  const pk = this.constructor.primaryKey;
  if (!pk || !this._attributes) return;
  const keys = Array.isArray(pk) ? pk : [pk];
  for (const key of keys) {
    if (typeof this._attributes.reset === "function") {
      this._attributes.reset(key);
    }
  }
}

export function strictLoadingMode(
  this: CoreRecord & { _strictLoadingMode?: StrictLoadingMode },
): StrictLoadingMode | null {
  return this._strictLoadingMode ?? null;
}

export function isStrictLoadingNPlusOneOnly(
  this: CoreRecord & { _strictLoadingMode?: StrictLoadingMode },
): boolean {
  return this._strictLoadingMode === "n_plus_one_only";
}

export function isStrictLoadingAll(
  this: CoreRecord & { _strictLoadingMode?: StrictLoadingMode },
): boolean {
  return this._strictLoadingMode === "all";
}

export function fullInspect(this: CoreRecord): string {
  return inspect.call(this);
}

// ---------------------------------------------------------------------------
// Class methods missing from api:compare
// ---------------------------------------------------------------------------

interface CoreHost {
  name: string;
  _filterAttributes?: (string | RegExp | ((key: string, value: unknown) => unknown))[];
  _inspectionFilter?: any;
  _connectionClass?: boolean;
  _destroyAssociationAsyncJob?: any;
  _findByStatementCache?: Map<boolean, Map<string, any>>;
  _generatedAssociationMethods?: Set<string>;
  _configurations?: any;
  _predicateBuilder?: any;
  arelTable?: any;
  prototype: any;
}

function parentClass(klass: CoreHost): CoreHost | null {
  const proto = Object.getPrototypeOf(klass);
  return typeof proto === "function" ? (proto as CoreHost) : null;
}

export function destroyAssociationAsyncJob(this: CoreHost, value?: any): any {
  if (value !== undefined) {
    this._destroyAssociationAsyncJob = value;
  }
  return this._destroyAssociationAsyncJob ?? null;
}

export function configurations(this: CoreHost, config?: any): any {
  if (config !== undefined) {
    this._configurations = config;
  }
  return this._configurations ?? {};
}

export function isApplicationRecordClass(this: CoreHost): boolean {
  return this.name === "ApplicationRecord";
}

// Rails uses ActiveSupport::IsolatedExecutionState for per-fiber/thread
// storage. We use AsyncLocalStorage for per-context isolation when a
// store has been established via withIsolatedConnectionState(). Callers
// outside that wrapper fall back to a process-global stack, so
// per-request isolation requires wrapping the request handler.
export type ConnectedToEntry = {
  role?: string;
  shard?: string;
  klasses: Set<any>;
  preventWrites?: boolean;
};

const _fallbackStack: ConnectedToEntry[] = [];
let _stackContext: AsyncContext<ConnectedToEntry[]> | null = null;
let _stackContextAdapter: ReturnType<typeof getAsyncContext> | null = null;

function getStackContext(): AsyncContext<ConnectedToEntry[]> {
  const adapter = getAsyncContext();
  if (!_stackContext || _stackContextAdapter !== adapter) {
    _stackContextAdapter = adapter;
    _stackContext = adapter.create<ConnectedToEntry[]>();
  }
  return _stackContext;
}

export function connectedToStack(): ConnectedToEntry[] {
  return getStackContext().getStore() ?? _fallbackStack;
}

/**
 * Run a callback with an isolated connected-to stack.
 * Nested connectedTo/connectedToMany calls inside will not affect
 * the outer context's stack.
 */
export function withIsolatedConnectionState<T>(fn: () => T): T {
  return getStackContext().run([], fn);
}

function klassesInclude(klasses: Set<any>, target: any): boolean {
  if (klasses.has(target)) return true;
  for (const k of klasses) {
    if (typeof k === "function" && k.name === "Base") return true;
  }
  return false;
}

function matchesStack(entry: ConnectedToEntry, connClass: CoreHost): boolean {
  return klassesInclude(entry.klasses, connClass) || klassesInclude(entry.klasses, "Base");
}

export function currentRole(this: CoreHost): string {
  const connClass = connectionClassForSelf.call(this);
  const stack = connectedToStack();
  for (let i = stack.length - 1; i >= 0; i--) {
    const entry = stack[i];
    if (entry.role && matchesStack(entry, connClass)) {
      return entry.role;
    }
  }
  return "writing";
}

export function currentShard(this: CoreHost): string {
  const connClass = connectionClassForSelf.call(this);
  const stack = connectedToStack();
  for (let i = stack.length - 1; i >= 0; i--) {
    const entry = stack[i];
    if (entry.shard && matchesStack(entry, connClass)) {
      return entry.shard;
    }
  }
  return "default";
}

export function currentPreventingWrites(this: CoreHost): boolean {
  const connClass = connectionClassForSelf.call(this);
  const stack = connectedToStack();
  for (let i = stack.length - 1; i >= 0; i--) {
    const entry = stack[i];
    if (entry.preventWrites !== undefined && matchesStack(entry, connClass)) {
      return entry.preventWrites;
    }
  }
  return false;
}

export function isPreventingWrites(this: CoreHost, className?: string): boolean {
  const stack = connectedToStack();
  for (let i = stack.length - 1; i >= 0; i--) {
    const entry = stack[i];
    if (entry.preventWrites === undefined) continue;
    if (klassesInclude(entry.klasses, "Base")) return entry.preventWrites;
    if (className) {
      for (const klass of entry.klasses) {
        if (typeof klass === "function" && klass.name === className) {
          return entry.preventWrites;
        }
      }
    }
  }
  return false;
}

export function connectionClass(this: CoreHost, value?: boolean): boolean {
  if (value !== undefined) {
    this._connectionClass = value;
  }
  return this._connectionClass ?? false;
}

export function isConnectionClass(this: CoreHost): boolean {
  return this._connectionClass ?? false;
}

/**
 * Walk up the class hierarchy to find the nearest connection class.
 * Mirrors: ActiveRecord::Core.connection_class_for_self
 */
export function connectionClassForSelf(this: CoreHost): CoreHost {
  let klass: CoreHost | null = this;
  while (klass) {
    if (klass._connectionClass) return klass;
    if (klass.name === "Base") return klass;
    klass = parentClass(klass);
  }
  return this;
}

/**
 * Mirrors: ActiveRecord::Core.asynchronous_queries_tracker
 */
export function asynchronousQueriesTracker(): {
  currentSession: any;
  finalize(): void;
} {
  return {
    currentSession: null,
    finalize() {},
  };
}

/**
 * Mirrors: ActiveRecord::Core.asynchronous_queries_session
 */
export function asynchronousQueriesSession(): any {
  return asynchronousQueriesTracker().currentSession;
}

export function strictLoadingViolationBang(
  this: CoreHost,
  owner: string,
  association: string,
): never {
  const message = `${owner} is marked for strict_loading. The ${association} association cannot be lazily loaded.`;
  Notifications.instrument("strict_loading_violation.active_record", {
    owner,
    reflection: association,
  });
  throw new Error(message);
}

export function initializeFindByCache(this: CoreHost): void {
  this._findByStatementCache = new Map();
  this._findByStatementCache.set(true, new Map());
  this._findByStatementCache.set(false, new Map());
}

/**
 * Rails: initializes generated_association_methods module and includes it.
 */
export function initializeGeneratedModules(this: CoreHost): void {
  generatedAssociationMethods.call(this);
}

export function generatedAssociationMethods(this: CoreHost): Set<string> {
  if (!this._generatedAssociationMethods) {
    this._generatedAssociationMethods = new Set();
  }
  return this._generatedAssociationMethods;
}

/**
 * Rails: delegates to superclass if @filter_attributes is nil.
 */
export function filterAttributes(
  this: CoreHost,
  value?: (string | RegExp | ((key: string, value: unknown) => unknown))[],
): (string | RegExp | ((key: string, value: unknown) => unknown))[] {
  if (value !== undefined) {
    this._filterAttributes = value;
    this._inspectionFilter = null;
  }
  if (Object.prototype.hasOwnProperty.call(this, "_filterAttributes"))
    return this._filterAttributes!;
  const parent = parentClass(this);
  if (parent) return filterAttributes.call(parent);
  return [];
}

// inspectionFilter is now in attribute-inspection.ts

/**
 * Rails: PredicateBuilder.new(TableMetadata.new(self, arel_table))
 * Memoized per class.
 *
 * Note: Rails passes a TableMetadata to PredicateBuilder. Our PredicateBuilder
 * currently takes a Table directly. TableMetadata.predicateBuilder handles the
 * full Rails flow when accessed from that path.
 */
export function predicateBuilder(this: CoreHost): any {
  if (this._predicateBuilder) return this._predicateBuilder;
  const table = this.arelTable;
  if (!table) return null;
  this._predicateBuilder = new PredicateBuilder(table);
  return this._predicateBuilder;
}

/**
 * Rails: TypeCaster::Map.new(self)
 * Provides type_cast_for_database used by in_order_of etc.
 */
export function typeCaster(this: CoreHost): {
  typeCastForDatabase(column: string, value: unknown): unknown;
} {
  const host = this;
  return {
    typeCastForDatabase(column: string, value: unknown): unknown {
      // Check if the model has attribute types that can cast
      const attrDefs = (host as any)._attributeDefinitions;
      if (attrDefs instanceof Map) {
        const def = attrDefs.get(column);
        if (def?.type?.serialize) return def.type.serialize(value);
      }
      return value;
    },
  };
}

/**
 * Rails: caches StatementCache per connection prepared_statements setting.
 */
export function cachedFindByStatement(
  this: CoreHost,
  connection: any,
  key: string,
  block: () => any,
): any {
  if (!this._findByStatementCache) initializeFindByCache.call(this);
  const prepared = connection?.preparedStatements ?? true;
  const cache = this._findByStatementCache!.get(prepared)!;
  if (!cache.has(key)) {
    cache.set(key, block());
  }
  return cache.get(key);
}

/** @internal */
function initInternals(): never {
  throw new NotImplementedError("ActiveRecord::Core#init_internals is not implemented");
}

/** @internal */
function initializeInternalsCallback(): never {
  throw new NotImplementedError(
    "ActiveRecord::Core#initialize_internals_callback is not implemented",
  );
}

/** @internal */
function isCustomInspectMethodDefined(): never {
  throw new NotImplementedError(
    "ActiveRecord::Core#custom_inspect_method_defined? is not implemented",
  );
}

/** @internal */
function inspectWithAttributes(attributesToList: any): never {
  throw new NotImplementedError("ActiveRecord::Core#inspect_with_attributes is not implemented");
}

/** @internal */
function attributesForInspect(): never {
  throw new NotImplementedError("ActiveRecord::Core#attributes_for_inspect is not implemented");
}

/** @internal */
function allAttributesForInspect(): never {
  throw new NotImplementedError("ActiveRecord::Core#all_attributes_for_inspect is not implemented");
}

/** @internal */
function relation(): never {
  throw new NotImplementedError("ActiveRecord::Core#relation is not implemented");
}

/** @internal */
function cachedFindBy(): never {
  throw new NotImplementedError("ActiveRecord::Core#cached_find_by is not implemented");
}
