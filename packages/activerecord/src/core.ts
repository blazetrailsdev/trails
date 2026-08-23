/**
 * Core behavior mixed into every ActiveRecord model.
 *
 * Mirrors: ActiveRecord::Core
 */

import { getApplicationRecordClass } from "./inheritance.js";
import {
  NameError,
  RecordNotFound,
  StatementInvalid,
  StrictLoadingViolationError,
} from "./errors.js";
import { ActiveRecord } from "./ar-config.js";
import { WRITING_ROLE } from "./roles.js";
import {
  DatabaseConfigurations,
  configurationsStore,
  setConfigurationsStore,
  type RawConfigurations,
} from "./database-configurations.js";
import type { DatabaseConfig } from "./database-configurations/database-config.js";
import {
  Notifications,
  IsolatedExecutionState,
  ParameterFilter,
  isPlainObject,
  constantize,
  pluralize,
} from "@blazetrails/activesupport";
import { AsynchronousQueriesTracker, type Session } from "./asynchronous-queries-tracker.js";
import { _reflectOnAssociation, reflectOnAggregation } from "./reflection.js";
import { compactUniqIds, compactUniqTuples } from "./relation/compact-uniq-ids.js";
import { PredicateBuilder } from "./relation/predicate-builder.js";
import { TableMetadata } from "./table-metadata.js";
import { argumentError } from "./relation/query-methods.js";
import { formatForInspect } from "./attribute-inspection.js";
import type { PrettyPrinter } from "./pretty-print.js";
import { Table, Nodes } from "@blazetrails/arel";
import { Map as TypeCasterMap } from "./type-caster/map.js";
import { buildPkWhereNode, columnsHash } from "./model-schema.js";
import { isPrimaryKeySettled } from "./attribute-methods/primary-key.js";
import { StatementCache } from "./statement-cache.js";
import { withConnection } from "./connection-handling.js";
import { RangeError as ActiveModelRangeError, runAllCallbacks } from "@blazetrails/activemodel";

/**
 * The Core module interface — methods mixed into every AR model.
 *
 * Mirrors: ActiveRecord::Core
 */
export interface Core {
  inspect(): string;
  attributeForInspect(attr: string): string;
  equals(other: unknown): boolean;
  freeze(): this;
  isFrozen(): boolean;
  compare(other: unknown): number | undefined;
  isPresent(): boolean;
  isBlank(): boolean;
  isReadonly(): boolean;
  readonlyBang(): this;
  isStrictLoading(): boolean;
  strictLoadingBang(value?: boolean, options?: { mode?: StrictLoadingMode }): this;
  strictLoadingMode(): StrictLoadingMode;
  isStrictLoadingAll(): boolean;
  isStrictLoadingNPlusOneOnly(): boolean;
}

export { InspectionMask } from "./attribute-inspection.js";
import { inspectionFilter as _inspectionFilterImpl } from "./attribute-inspection.js";

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
  // Rails: inspect → inspect_with_attributes(attributes_for_inspect), which
  // honors a per-model attributes_for_inspect override (defaults to :all).
  return inspectWithAttributes.call(this as any, attributesForInspect.call(this));
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
 * Pretty-print this record through the `PP` protocol, rendering
 * `#<ClassName attr: value, ...>` so a record nested inside a relation /
 * collection-proxy `prettyPrint` is rendered the same way Rails does.
 *
 * Mirrors: ActiveRecord::Core#pretty_print
 */
export async function prettyPrint(
  this: CoreRecord & { _attributes: any; constructor: { prototype: object } },
  pp: PrettyPrinter,
): Promise<void> {
  if (isCustomInspectMethodDefined.call(this)) {
    // Rails returns `super` here, so Ruby PP renders the record's own
    // (overridden) `inspect`. Dispatch dynamically rather than calling the
    // core `inspect` helper, so a model that overrides `inspect` is honored.
    pp.text((this as unknown as { inspect(): string }).inspect());
    return;
  }
  await pp.objectAddressGroup(this as object, async () => {
    if (!this._attributes) {
      pp.breakable(" ");
      pp.text("not initialized");
      return;
    }
    const knownKeys = new Set<string>(
      Array.from(this._attributes as Iterable<[string, unknown]>).map(([k]) => k),
    );
    const attrNames = attributesForInspect.call(this).filter((name) => knownKeys.has(name));
    await pp.seplist(
      attrNames,
      () => pp.text(","),
      async (attrName) => {
        pp.breakable(" ");
        await pp.group(1, "", "", () => {
          pp.text(attrName);
          pp.text(":");
          pp.breakable();
          pp.text(
            (this as unknown as { attributeForInspect(attr: string): string }).attributeForInspect(
              attrName,
            ),
          );
        });
      },
    );
  });
}

/**
 * Compare two records for equality by class and primary key.
 *
 * Mirrors: ActiveRecord::Core#==
 */
export function equals(this: CoreRecord, other: unknown): boolean {
  // Rails' Object#== identity check (`super`): same exact object.
  if (this === other) return true;
  if (other === null || other === undefined) return false;
  if (typeof other !== "object") return false;
  // `instance_of?(self.class)` is an exact-class match, not subclass.
  if (this.constructor !== (other as any).constructor) return false;
  // A record with no primary-key values present (a new record whose id
  // columns are all nil) is different from any other record. For a composite
  // primary key this requires every id column to be set.
  if (!(this as unknown as { isPrimaryKeyValuesPresent(): boolean }).isPrimaryKeyValuesPresent())
    return false;
  return primaryKeyValuesEqual(this.id, (other as CoreRecord).id);
}

// Per-instance identity keys for records without primary-key values present.
// Mirrors Ruby's `super` (Object#hash): a stable, unique value per object, so
// two distinct new records never dedup against each other.
const identityHashKeys = new WeakMap<object, symbol>();

// Per-constructor identity tokens. Rails combines `self.class.hash` with the
// id, so the class *object's* identity — not its name — participates in the
// hash. Keying on `constructor.name` would collide two distinct model classes
// that happen to share a JS name, whereas `equals` demands exact constructor
// identity; this WeakMap gives each constructor a stable, unique token.
const constructorHashTokens = new WeakMap<object, number>();
let nextConstructorToken = 0;

function constructorToken(ctor: object): number {
  let token = constructorHashTokens.get(ctor);
  if (token === undefined) {
    token = nextConstructorToken++;
    constructorHashTokens.set(ctor, token);
  }
  return token;
}

// Serialize a scalar or composite id into a stable, injective string. Unlike
// `JSON.stringify`, this tolerates `bigint` values, which trails' `big_integer`
// type preserves and which Rails hashes without issue via `id.hash`. Array
// elements are length-prefixed so component boundaries can never collapse —
// Rails' `Array#hash` likewise preserves element boundaries, so two distinct
// composite ids must not share a key (`core.rb:641-648`).
function serializeIdForHash(id: unknown): string {
  if (Array.isArray(id)) {
    return `A${id.map((el) => lengthPrefixed(serializeIdForHash(el))).join("")}`;
  }
  return `S${typeof id}:${String(id)}`;
}

function lengthPrefixed(value: string): string {
  return `${value.length}:${value}`;
}

/**
 * Return a value that dedups records the way Ruby's `hash` + `eql?` do: two
 * records of the same class with equal primary-key values share a key, while
 * records without primary-key values present are unique per instance.
 *
 * Mirrors: ActiveRecord::Core#hash
 */
export function hash(this: CoreRecord): unknown {
  if ((this as unknown as { isPrimaryKeyValuesPresent(): boolean }).isPrimaryKeyValuesPresent()) {
    return `${constructorToken(this.constructor)}#${serializeIdForHash(this.id)}`;
  }
  let key = identityHashKeys.get(this);
  if (key === undefined) {
    key = Symbol("record-hash");
    identityHashKeys.set(this, key);
  }
  return key;
}

/**
 * Compare two primary-key values by value. Composite keys are arrays and must
 * be compared element-wise; scalar keys compare directly.
 */
function primaryKeyValuesEqual(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((value, index) => value === b[index]);
  }
  return a === b;
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

/**
 * Returns true if this record's attribute set has been frozen.
 *
 * Mirrors: ActiveRecord::Core#frozen? — `@attributes.frozen?` in Rails.
 */
export function isFrozen(this: FrozenRecord): boolean {
  return this._attributes.isFrozen();
}

/**
 * Order two records by primary key, so arrays of records sort.
 *
 * Ruby's `to_key <=> other_object.to_key` is `Array#<=>` (element-wise, then
 * by length) when both keys are present, and `nil <=> nil` (`0`) when neither
 * record has one. A mixed nil/array pair — one persisted record, one new —
 * compares as `nil`, spelled `undefined` here. The `else` arm is Ruby's
 * `super` (`Object#<=>`): `0` for equal objects, `nil` otherwise.
 *
 * Mirrors: ActiveRecord::Core#<=>
 */
export function compare(this: CoreRecord, otherObject: unknown): number | undefined {
  if (otherObject instanceof (this.constructor as new (...args: never[]) => unknown)) {
    return compareKeys(
      (this as unknown as ComparableRecord).toKey(),
      (otherObject as ComparableRecord).toKey(),
    );
  }
  return equals.call(this, otherObject) ? 0 : undefined;
}

interface ComparableRecord {
  toKey(): unknown[] | null;
}

function compareKeys(a: unknown[] | null, b: unknown[] | null): number | undefined {
  if (a === null || b === null) return a === null && b === null ? 0 : undefined;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const cmp = compareValues(a[i], b[i]);
    if (cmp !== 0) return cmp;
  }
  return Math.sign(a.length - b.length);
}

function compareValues(a: unknown, b: unknown): number | undefined {
  if (typeof a !== typeof b) return undefined;
  if (typeof a === "number" || typeof a === "bigint" || typeof a === "string") {
    return a === (b as typeof a) ? 0 : a < (b as typeof a) ? -1 : 1;
  }
  return a === b ? 0 : undefined;
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
// Readonly / strict-loading instance predicates and setters.
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

// ---------------------------------------------------------------------------
// Instance methods missing from parity:api
// ---------------------------------------------------------------------------

export function initWithAttributes(
  this: CoreRecord & { _attributes: any; _newRecord: boolean },
  attributes: any,
  newRecord = false,
): void {
  this._newRecord = newRecord;
  this._attributes = attributes;
}

/**
 * Mirrors `ActiveRecord::Core#init_attributes` (core.rb:563-573) — the base of
 * the `init_attributes` chain `ActiveModel::Dirty` overrides
 * (dirty.rb:253-262). Deep-dups the source's attribute set and resets the
 * primary key(s); the copy that `initialize_dup` installs is what it returns.
 */
export function initAttributes(
  this: CoreRecord & { _attributes: any; constructor: { primaryKey?: string | string[] } },
  _other: unknown,
): any {
  const attrs = this._attributes.deepDup();
  const primaryKey = this.constructor.primaryKey;
  if (Array.isArray(primaryKey)) {
    for (const key of primaryKey) attrs.reset(key);
  } else if (primaryKey != null) {
    attrs.reset(primaryKey);
  }
  return attrs;
}

type StrictLoadingModeHost = CoreRecord & { _strictLoadingMode?: StrictLoadingMode };

/**
 * The record's strict-loading mode, seeded from `Model.strictLoadingMode` at
 * construction by {@link initInternals} and overridable per-instance via
 * `strictLoadingBang`. The `?? "all"` guards records built outside the normal
 * constructor path (e.g. raw `Object.create`).
 *
 * Mirrors Rails `init_internals`: `@strict_loading_mode = klass.strict_loading_mode`.
 */
export function strictLoadingMode(this: StrictLoadingModeHost): StrictLoadingMode {
  return this._strictLoadingMode ?? "all";
}

export function isStrictLoadingNPlusOneOnly(this: StrictLoadingModeHost): boolean {
  return strictLoadingMode.call(this) === "n_plus_one_only";
}

export function isStrictLoadingAll(this: StrictLoadingModeHost): boolean {
  return strictLoadingMode.call(this) === "all";
}

/**
 * Like {@link inspect} but ignores `attributes_for_inspect`, always listing
 * every attribute.
 *
 * Mirrors: ActiveRecord::Core#full_inspect
 * (`inspect_with_attributes(all_attributes_for_inspect)`)
 */
export function fullInspect(this: CoreRecord): string {
  return inspectWithAttributes.call(this as any, allAttributesForInspect.call(this));
}

// ---------------------------------------------------------------------------
// Class methods missing from parity:api
// ---------------------------------------------------------------------------

interface CoreHost {
  name: string;
  tableName?: string;
  primaryKey?: string | string[];
  compositePrimaryKey?: boolean;
  _filterAttributes?: (string | RegExp | ((key: string, value: unknown) => unknown))[];
  _inspectionFilter?: any;
  _connectionClass?: boolean;
  _connectionHandler?: any;
  _destroyAssociationAsyncJob?: any;
  _findByStatementCache?: Map<boolean, Map<string, any>>;
  _generatedAssociationMethods?: Set<string>;
  _predicateBuilder?: any;
  arelTable?: any;
  prototype: any;
  all(): any;
  isScopeAttributes(): boolean;
  typeForAttribute(name: string): { cast(value: unknown): unknown };
  ensureSchemaLoaded(): Promise<void>;
}

function parentClass(klass: CoreHost): CoreHost | null {
  const proto = Object.getPrototypeOf(klass);
  return typeof proto === "function" ? (proto as CoreHost) : null;
}

export function destroyAssociationAsyncJob(this: CoreHost, value?: any): any {
  if (value !== undefined) {
    // Rails aliases the writer straight to `_destroy_association_async_job=`
    // (core.rb:36), a plain setter that never resolves the constant. Only the
    // reader below constantizes, so assigning a not-yet-registered class name
    // stays legal.
    this._destroyAssociationAsyncJob = value;
    return this._destroyAssociationAsyncJob;
  }
  if (typeof this._destroyAssociationAsyncJob === "string") {
    try {
      this._destroyAssociationAsyncJob = constantize(this._destroyAssociationAsyncJob);
    } catch (error) {
      if (!(error instanceof NameError)) throw error;
      throw new NameError(`Unable to load destroy_association_async_job: ${error.message}`);
    }
  }
  return this._destroyAssociationAsyncJob ?? null;
}

// Rails backs `configurations` with the class variable `@@configurations`
// (core.rb:71-79), so there is exactly one registry for the whole process:
// assigning through any model class replaces `ActiveRecord::Base`'s value.
// A per-class static would instead shadow through the JS prototype chain.
// The store itself lives in database-configurations.ts so that leaf modules
// (ConnectionHandler) can read it without importing core.ts, which would close
// an import cycle through base.ts and break its static initializers.

/**
 * Mirrors: ActiveRecord::Base.configurations / .configurations=
 *
 * Takes no `this`: Rails reads and writes the `@@configurations` class
 * variable, so the receiver never participates. Callers that Rails spells
 * `Base.configurations` therefore cannot be redirected by a model-local
 * override.
 */
export function configurations(
  config?: RawConfigurations | DatabaseConfigurations | DatabaseConfig[],
): DatabaseConfigurations {
  if (config !== undefined) {
    setConfigurationsStore(
      config instanceof DatabaseConfigurations
        ? config
        : Array.isArray(config)
          ? new DatabaseConfigurations(config)
          : DatabaseConfigurations.fromEnv(config),
    );
  }
  return configurationsStore();
}

export function isApplicationRecordClass(this: CoreHost): boolean {
  const explicit = getApplicationRecordClass();
  if (explicit) return (this as unknown) === explicit;
  return (this as unknown) === (globalThis as Record<string, unknown>)["ApplicationRecord"];
}

export type ConnectedToEntry = {
  role?: string;
  shard?: string;
  klasses: any[];
  preventWrites?: boolean;
};

const CONNECTED_TO_STACK_KEY = Symbol.for("ar_connected_to_stack");

/**
 * @missingRailsCall new — PERMANENT: Rails allocates a `Concurrent::Array.new`
 *   (core.rb:220); JS has no concurrent-array class and the single-threaded
 *   event loop needs none, so the stack is a plain `[]`.
 */
export function connectedToStack(): ConnectedToEntry[] {
  return IsolatedExecutionState.fetch<ConnectedToEntry[]>(CONNECTED_TO_STACK_KEY, () => []);
}

/**
 * Run a callback with an isolated connected-to stack.
 * Nested connectedTo/connectedToMany calls inside will not affect
 * the outer context's stack.
 */
export function withIsolatedConnectionState<T>(fn: () => T): T {
  return IsolatedExecutionState.scope(CONNECTED_TO_STACK_KEY, [] as ConnectedToEntry[], fn);
}

/**
 * Rails names `Base` directly in `hash[:klasses].include?(Base)`. core.ts is
 * imported *by* base.ts, so the constant cannot be named here; the own
 * `_isActiveRecordBase` brand is how the rest of core.ts identifies it.
 */
function isBase(klass: any): boolean {
  return (
    typeof klass === "function" &&
    Object.prototype.hasOwnProperty.call(klass, "_isActiveRecordBase")
  );
}

export function currentRole(this: CoreHost): string {
  const stack = connectedToStack();
  for (let i = stack.length - 1; i >= 0; i--) {
    const hash = stack[i];
    if (hash.role && hash.klasses.some(isBase)) return hash.role;
    if (hash.role && hash.klasses.includes(connectionClassForSelf.call(this))) return hash.role;
  }

  // Rails: current_role falls back to default_role (core.rb:165), a
  // class_attribute seeded to writing_role.
  return (this as CoreHost & { defaultRole?: string }).defaultRole ?? WRITING_ROLE;
}

export function currentShard(this: CoreHost): string {
  const stack = connectedToStack();
  for (let i = stack.length - 1; i >= 0; i--) {
    const hash = stack[i];
    if (hash.shard && hash.klasses.some(isBase)) return hash.shard;
    if (hash.shard && hash.klasses.includes(connectionClassForSelf.call(this))) return hash.shard;
  }

  // Mirrors Rails: default_shard (class_attribute, set by connects_to)
  return (connectionClassForSelf.call(this) as any)._defaultShard ?? "default";
}

export function currentPreventingWrites(this: CoreHost): boolean {
  const stack = connectedToStack();
  for (let i = stack.length - 1; i >= 0; i--) {
    const hash = stack[i];
    if (hash.preventWrites !== undefined && hash.klasses.some(isBase)) return hash.preventWrites;
    if (
      hash.preventWrites !== undefined &&
      hash.klasses.includes(connectionClassForSelf.call(this))
    )
      return hash.preventWrites;
  }

  return false;
}

/**
 * Mirrors: ActiveRecord::Core.preventing_writes? (`core.rb:205-213`).
 *
 * @missingRailsCall include? — PERMANENT: TS language shortcoming: Rails'
 *   `hash[:klasses].include?(Base)` (core.rb:206) names Base, but core.ts is
 *   imported *by* base.ts, so the constant cannot be referenced here; the arm is
 *   spelled `klasses.some(isBase)` against the own `_isActiveRecordBase` brand.
 */
export function isPreventingWrites(className?: string): boolean {
  const stack = connectedToStack();
  for (let i = stack.length - 1; i >= 0; i--) {
    const hash = stack[i];
    if (hash.preventWrites !== undefined && hash.klasses.some(isBase)) return hash.preventWrites;
    if (
      hash.preventWrites !== undefined &&
      hash.klasses.some((klass) => typeof klass === "function" && klass.name === className)
    )
      return hash.preventWrites;
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
  return connectionClass.call(this);
}

/**
 * Walk up the class hierarchy to find the nearest connection class.
 * Mirrors: ActiveRecord::Core.connection_class_for_self
 */
export function connectionClassForSelf(this: CoreHost): CoreHost {
  let klass: CoreHost | null = this;
  while (klass) {
    if (Object.prototype.hasOwnProperty.call(klass, "_connectionClass") && klass._connectionClass)
      return klass;
    if (klass.name === "Base") return klass;
    klass = parentClass(klass);
  }
  return this;
}

/**
 * Mirrors: ActiveRecord::Core.asynchronous_queries_tracker
 */
export function asynchronousQueriesTracker(): AsynchronousQueriesTracker {
  return IsolatedExecutionState.fetch<AsynchronousQueriesTracker>(
    ASYNCHRONOUS_QUERIES_TRACKER_KEY,
    () => new AsynchronousQueriesTracker(),
  );
}

const ASYNCHRONOUS_QUERIES_TRACKER_KEY = "active_record_asynchronous_queries_tracker";

/**
 * Mirrors: ActiveRecord::Core.asynchronous_queries_session
 */
export function asynchronousQueriesSession(): Session {
  return asynchronousQueriesTracker().currentSession;
}

/**
 * Dispatch a detected strict-loading violation. Under the default
 * `action_on_strict_loading_violation = "raise"` this throws
 * `StrictLoadingViolationError`; under `"log"` it instruments
 * `strict_loading_violation.active_record` and returns so the caller can
 * continue the (now warned-about) lazy load. Rails' callers pass
 * `owner: owner.class` (association.rb:250).
 *
 * Mirrors: ActiveRecord::Core.strict_loading_violation!
 */
export function strictLoadingViolationBang({
  owner,
  reflection,
}: {
  owner: unknown;
  reflection: { name: string; strictLoadingViolationMessage(owner: unknown): string };
}): void {
  switch (ActiveRecord.actionOnStrictLoadingViolation) {
    case "raise": {
      const message = reflection.strictLoadingViolationMessage(owner);
      throw new StrictLoadingViolationError(message);
    }
    case "log": {
      const name = "strict_loading_violation.active_record";
      Notifications.instrument(name, { owner, reflection });
    }
  }
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

/**
 * @missingRailsCall include — PERMANENT: Rails `include mod` mixes a generated
 *   Module into the class (core.rb:341); trails has no generated module —
 *   `generatedAssociationMethods` is a Set of generated method names — so there
 *   is nothing to include.
 */
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
 * Backed by a TableMetadata (like Rails) so dot-notation / schema-qualified
 * keys and association-key expansion flow through the associated_table
 * fallback — `buildFromHash({"schema.table.column": v})` expands to
 * `"schema.table"."column" = ?` without a hand-built TableMetadata.
 *
 * Memoize as an OWN property (not a prototype-chain read): the builder's
 * TableMetadata is bound to `this`, so an STI subclass (same table_name) must
 * not inherit the parent's builder — that would resolve associations/
 * aggregates against the wrong klass. Rails gets this from `inherited`
 * resetting `@predicate_builder = nil` in the subclass (core.rb:422-425).
 */
export function predicateBuilder(this: CoreHost): PredicateBuilder {
  if (Object.prototype.hasOwnProperty.call(this, "_predicateBuilder") && this._predicateBuilder)
    return this._predicateBuilder;
  this._predicateBuilder = new PredicateBuilder(new TableMetadata(this as any, this.arelTable));
  return this._predicateBuilder;
}

/**
 * Rails: TypeCaster::Map.new(self)
 * Provides type_cast_for_database used by in_order_of etc.
 */
export function typeCaster(this: CoreHost): TypeCasterMap {
  return new TypeCasterMap(this);
}

/**
 * Rails: caches StatementCache per connection prepared_statements setting.
 */
export function cachedFindByStatement(
  this: CoreHost,
  connection: any,
  key: string,
  block: (params: any) => any,
): any {
  // Static fields are inherited via the prototype chain, so a subclass that
  // never initialized its own cache would see the parent's map as truthy and
  // hit the parent's cached statement (returning Parent instances). Require an
  // own property — mirroring Rails initializing @find_by_statement_cache per
  // class in the `inherited` hook. The `|| !value` arm re-inits after a
  // table_name change clears it to undefined (an own, falsy property).
  if (
    !Object.prototype.hasOwnProperty.call(this, "_findByStatementCache") ||
    !this._findByStatementCache
  ) {
    initializeFindByCache.call(this);
  }
  const prepared = connection?.preparedStatements ?? true;
  const cache = this._findByStatementCache!.get(prepared)!;
  if (!cache.has(key)) {
    cache.set(key, StatementCache.create(connection, block));
  }
  return cache.get(key);
}

export function inspectionFilter(this: CoreHost): ParameterFilter {
  return _inspectionFilterImpl.call(this);
}

export function connectionHandler(this: CoreHost, value?: any): any {
  if (value !== undefined) {
    this._connectionHandler = value;
    return value;
  }
  return this._connectionHandler;
}

export function arelTable(this: CoreHost): Table {
  return new Table((this as any).tableName, { klass: this as any });
}

/**
 * The root of the `init_internals` chain — every other concern's hook is
 * prepended onto `Base.prototype` above it and opens with `super_`
 * (core.rb:834-849).
 *
 * Rails' root has no `super`: `include Core` (base.rb:299) sits below every
 * later include, so ActiveModel's `Validations`/`Dirty` links (validations.rb:467,
 * dirty.rb:372) are *above* Core in the MRO. In trails those links are prepended
 * onto `Model.prototype`, the superclass prototype, so they sit BELOW this one —
 * hence the `super_()` here, which is the same set of links Ruby reaches, entered
 * from the other end.
 *
 * `@new_record = true` is `Core#initialize`'s own first line (core.rb:390), two
 * lines above its `init_internals` call and so before `assign_attributes`
 * (:394) — which is what lets a `#{name}_attributes=` writer dispatched on that
 * one pass see `new_record?`. A JS constructor cannot touch `this` before
 * `super()`, so `Base`'s field initializer runs only after ActiveModel has
 * already assigned; the flag is raised here instead, at the first seat that
 * runs before the assignment and in Rails' own order.
 *
 * `@primary_key = klass.primary_key` (core.rb:846) has no seat here: trails
 * resolves the primary key off the class at read time
 * (`primaryKeyOf`, attribute-methods/primary-key.ts), because schema reflection
 * is asynchronous and a record constructed before its schema loads would latch
 * a placeholder key for its whole life. Converging that slot is tracked
 * separately (RFC 0115 `seat-the-per-instance-primary-key-slot`).
 *
 * `klass.define_attribute_methods` (core.rb:849) has no seat here either, and
 * is CONVERGEABLE rather than permanent. It carries no `@missingRailsCall`
 * because the tag cannot apply to it: the extractor records the Ruby side as
 * `ref:define_attribute_methods`, and `ref:` identifiers are report-only, so
 * `parity:api:calls` never flags this omission and reads any tag on it as a
 * STALE justification (gate exit 1). The reason therefore lives here in prose
 * until the call itself lands. Porting it was tried and reverted: a
 * construction-time generation pass runs before the async schema load, and the
 * post-load pass (`applyColumnsHash`, model-schema.ts:1301-1302, which clears
 * `_attributeMethodsGenerated` so the next demand regenerates) then seats a
 * SECOND generated-module carrier. `undefineAttributeMethods` clears one of the
 * two, so the accessor survives an undefine that Rails' own
 * `attribute_methods_test.rb:1098-1117` requires to clear it. The duplicate
 * carrier is the blocker, not the call; RFC 0115
 * `call-define-attribute-methods-from-init-internals` carries the finding.
 *
 * @internal
 */
export function initInternals(
  this: CoreRecord & {
    _newRecord: boolean;
    _readonly: boolean;
    _previouslyNewRecord: boolean;
    _destroyed: boolean;
    _markedForDestruction: boolean;
    _destroyedByAssociation: unknown;
    _startTransactionState: unknown;
    _strictLoading: boolean;
    _strictLoadingMode?: StrictLoadingMode;
    _primaryKey?: string | string[] | null;
  },
  super_: () => void,
): void {
  this._newRecord = true;
  super_();
  this._readonly = false;
  this._previouslyNewRecord = false;
  this._destroyed = false;
  this._markedForDestruction = false;
  this._destroyedByAssociation = null;
  this._startTransactionState = null;
  const klass = this.constructor as any;
  // core.rb:846 — `@primary_key = klass.primary_key`; every instance-side
  // primary-key reader then reads the ivar (primary_key.rb:18-56).
  // trails' schema reflection is async, so a record built before its class'
  // columns hash has arrived would latch `get_primary_key`'s cold-cache
  // convention ("id", attribute-methods/primary-key.ts:382) for the record's
  // lifetime. The seat is therefore taken only once the class can answer for
  // real — an explicitly configured key, or a loaded schema — and
  // `primaryKeyOf` reads through to the class until then.
  if (isPrimaryKeySettled.call(klass)) this._primaryKey = klass.primaryKey;
  this._strictLoading = klass.strictLoadingByDefault ?? false;
  this._strictLoadingMode = klass.strictLoadingMode;
}

/**
 * Mirrors `ActiveRecord::Core#initialize_dup` (core.rb:550-562): the duped
 * attribute set is installed, the initialize callbacks run against it, the
 * new-record state is reset, and `super` unwinds through
 * Locking::Optimistic (optimistic.rb:72-75) and Timestamp (timestamp.rb:50-53),
 * so the hook still observes the source's `lock_version` / timestamps.
 *
 * `@attributes = init_attributes(other)` is spelled before `super_` for the
 * same reason `super_` is spelled first below: trails reaches ActiveModel's
 * links DOWN the prototype chain where Ruby reaches them UP the ancestors, so
 * the links Ruby runs BEFORE this body have to be entered from inside it. In
 * Ruby they observe the source's `@attributes` and Core replaces it afterwards;
 * here they observe the replacement — the same set Ruby leaves behind, since
 * `Attributes#initialize_dup`'s deep-dup of the source is discarded by that
 * replacement (attributes.rb:111-114, core.rb:551). `init_attributes` is sent to
 * `this`, so the `ActiveModel::Dirty` override prepended over
 * {@link initAttributes} (dirty.rb:253-262) is the one that answers.
 *
 * As with {@link initInternals}, Ruby reaches ActiveModel's links from above and
 * trails from below; `super_` is the receiver-bound link `prepend()` hands the
 * module.
 *
 * @internal
 */
export function initializeDup(
  this: CoreRecord & {
    _attributes: any;
    _newRecord: boolean;
    _previouslyNewRecord: boolean;
    _destroyed: boolean;
    _startTransactionState: unknown;
  },
  super_: (other: unknown) => void,
  other: unknown,
): void {
  // `super_` leads DOWN to ActiveModel's links here, where Ruby reaches them
  // going up (see initInternals), so it is spelled first to keep Rails'
  // observable order: `Attributes`/`Validations`/`Dirty` (attributes.rb:111,
  // validations.rb:310, dirty.rb:248) all sit ABOVE Core in the MRO and have
  // already replaced `@errors` and the mutation trackers by the time Core runs
  // the initialize callbacks.
  this._attributes = (
    this as unknown as { initAttributes(other: unknown): unknown }
  ).initAttributes(other);
  super_(other);
  // `initialize` is registered `only: :after`, so this fires just the
  // after_initialize chain. strict:"sync" guarantees synchronous completion —
  // void the settled result.
  void runAllCallbacks(
    (this.constructor as { prototype: object }).prototype,
    "initialize",
    this,
    undefined,
    { strict: "sync" },
  );
  this._newRecord = true;
  this._previouslyNewRecord = false;
  this._destroyed = false;
  this._startTransactionState = null;
}

/** @internal */
export function initializeInternalsCallback(this: unknown): void {
  // hook for subclasses — overridden by inheritance.ts
}

/** @internal */
export function isCustomInspectMethodDefined(this: {
  constructor: { prototype: object };
}): boolean {
  return Object.prototype.hasOwnProperty.call(this.constructor.prototype, "inspect");
}

/** @internal */
export function inspectWithAttributes(
  this: CoreRecord & { _attributes: any },
  attributesToList: string[],
): string {
  const ctor = this.constructor as { name: string };
  if (!this._attributes) return `#<${ctor.name} not initialized>`;
  // Rails: attributes_to_list.filter_map { |name| ... if _has_attribute?(name) }
  // _has_attribute? checks @attributes.key?(name) — same as checking the attribute set
  const knownKeys = new Set<string>(
    Array.from(this._attributes as Iterable<[string, unknown]>).map(([k]) => k),
  );
  const parts = attributesToList
    .filter((name) => knownKeys.has(name))
    .map(
      (name) =>
        `${name}: ${(this as unknown as { attributeForInspect(attr: string): string }).attributeForInspect(name)}`,
    );
  return `#<${ctor.name} ${parts.join(", ")}>`;
}

/** @internal */
export function attributesForInspect(this: CoreRecord): string[] {
  const klass = this.constructor as any;
  const forInspect = klass.attributesForInspect;
  if (forInspect === "all" || forInspect == null) return allAttributesForInspect.call(this);
  return Array.isArray(forInspect) ? forInspect : allAttributesForInspect.call(this);
}

/** @internal */
export function allAttributesForInspect(this: CoreRecord): string[] {
  if (!this._attributes) return [];
  return Array.from(this._attributes).map(([k]) => k);
}

/** @internal */
function relation(this: CoreHost): any {
  return (this as any).all();
}

/**
 * Canonical key for matching a requested id against a fetched record's PK.
 * Numeric ids (`number` | `bigint`) are folded to their decimal string so a
 * `bigint` PK value compares equal to the `number`/string the caller passed
 * (and vice versa); other scalar key types fall back to identity.
 */
function pkMatchKey(value: unknown): unknown {
  return typeof value === "bigint" || typeof value === "number" ? String(value) : value;
}

/**
 * Raise the "couldn't find all" aggregate not-found error, mirroring Rails'
 * `raise_record_not_found_exception!` else-branch (finder_methods.rb:430-431):
 * the model name is pluralized and the message carries the found/expected
 * counts. `ids` is flattened for the message so composite tuples render like
 * Ruby's recursive `Array#join` (`[[1, 2], [3, 4]].join(", ")` → "1, 2, 3, 4").
 * Core#find runs unscoped, so there is no `[WHERE …]` conditions clause.
 */
function raiseCouldntFindAll(
  name: string,
  pk: string,
  ids: unknown[],
  payload: unknown,
  resultSize: number,
  expectedSize: number,
): never {
  throw new RecordNotFound(
    `Couldn't find all ${pluralize(name)} with '${pk}': ` +
      `(${ids.flat(Infinity).join(", ")}) ` +
      `(found ${resultSize} results, but was looking for ${expectedSize}).`,
    name,
    pk,
    payload,
  );
}

export async function find(this: CoreHost, ...ids: unknown[]): Promise<any> {
  // Reflect the schema before casting ids — the cast below reads
  // attribute definitions that lazy reflection populates.
  await this.ensureSchemaLoaded();
  if (ids.length === 0) {
    // Rails Core#find delegates a zero-arg call to `super` → `find_with_ids`,
    // whose `when 0` branch raises "Couldn't find <Model> without an ID"
    // (finder_methods.rb:508), no id payload.
    throw new RecordNotFound(
      `Couldn't find ${this.name} without an ID`,
      this.name,
      String(this.primaryKey),
    );
  }
  // Rails Core#find fast-path: a single supported scalar id on a simple
  // primary key (no scope, no block) goes through the cached StatementCache.
  // Both prepared and unprepared connections use it (Rails buckets the cache by
  // prepared_statements in cachedFindByStatement); the unprepared PartialQuery
  // path inlines its binds into the SQL and runs with an empty bind list,
  // matching Rails' unprepared query-log shape (see StatementCache#execute).
  // Rails Core#find: `return super if scope_attributes?` — a default scope can
  // add includes/references/order the StatementCache fast path can't reproduce
  // (it builds a bare `where(pk).limit(1)`), so defer to the relation path,
  // which applies the default scope's eager joins. Mirrors the `findBy` guard.
  if (
    ids.length === 1 &&
    !this.isScopeAttributes() &&
    this.primaryKey != null &&
    !this.compositePrimaryKey &&
    !Array.isArray(ids[0]) &&
    !StatementCache.unsupportedValue(ids[0])
  ) {
    const pk = this.primaryKey as string;
    // Rails passes the raw id; type coercion happens inside the StatementCache
    // bind path (the bound pk attribute carries the column type), so neither
    // find nor find_by pre-casts here.
    const record = await cachedFindBy.call(this, [pk], [ids[0]]);
    if (record) return record;
    throw new RecordNotFound(
      `Couldn't find ${this.name} with '${pk}'=${String(ids[0])}`,
      this.name,
      pk,
      ids[0],
    );
  }
  if (ids.length > 1) {
    // CPK variadic scalars are ambiguous — require explicit array form
    if (this.compositePrimaryKey && ids.some((i) => !Array.isArray(i))) {
      throw argumentError(
        `${this.name} has a composite primary key (${String(this.primaryKey)}); ` +
          `call find([...tuple]) or find([[...], [...]]) rather than variadic scalars.`,
      );
    }
    if (this.compositePrimaryKey) {
      // Rails `expects_array = ids.first.first.is_a?(Array)` is computed on
      // the *original* vararg list (finder_methods.rb:494-498). For a plain
      // variadic tuple list like `find([1, 2], [1, 2])`, `ids.first` is the
      // first tuple `[1, 2]` and its `.first` is a scalar → `expects_array`
      // is false, so a `compact.uniq` collapse to a single tuple returns the
      // bare record (`find_one`), not `[record]`. Recursing with the raw
      // vararg list as one argument would lose that distinction (the callee
      // sees `id[0]` as an Array and always wraps), so dedupe here and
      // dispatch to the single-tuple form when it collapses.
      const expectsArray = Array.isArray((ids[0] as unknown[])[0]);
      const tuples = compactUniqTuples(ids);
      if (tuples.length === 1 && !expectsArray) {
        return (this as any).find(tuples[0]);
      }
      return (this as any).find(tuples);
    }
    return (this as any).find(ids);
  }
  const id = ids[0];

  if (this.compositePrimaryKey && Array.isArray(id)) {
    // Rails `expects_array = ids.first.first.is_a?(Array)`
    // (finder_methods.rb:494-498): only the *first* element of the arg
    // decides list-vs-single-tuple. So `find([nil, [1, 2]])` (first element
    // nil, not an Array) is a single degenerate tuple — the nil is preserved,
    // NOT dropped as a list entry — while a tuple's own nil component
    // (`find([[1, nil]])`) also stays a single tuple.
    if (Array.isArray(id[0])) {
      // Rails `ids = ids.compact.uniq`: drop nil outer entries and fold
      // structurally-equal tuples, so `find([[1, 2], [1, 2]])` collapses to
      // one tuple and returns the single record (wrapped per expects_array).
      const tuples = compactUniqTuples(id) as unknown[][];
      const whereNodes = tuples.map((tuple) => buildPkWhereNode.call(this as any, tuple));
      const orCondition = whereNodes.reduce((left, right) => new Nodes.Or([left, right]));
      const records = await this.all().where(new Nodes.Grouping(orCondition)).toArray();
      if (records.length !== tuples.length) {
        raiseCouldntFindAll(
          this.name,
          String(this.primaryKey),
          tuples,
          id,
          records.length,
          tuples.length,
        );
      }
      return records;
    }
    const pk = this.primaryKey as string[];
    const whereConditions: Record<string, unknown> = {};
    pk.forEach((col, i) => {
      whereConditions[col] = (id as unknown[])[i];
    });
    const record = await this.all().where(whereConditions).first();
    if (!record) {
      // Rails find_one([tuple]) raises via raise_record_not_found_exception!
      // with Array.wrap(ids).size == pkArity > 1, so a composite single-tuple
      // miss renders the aggregate "couldn't find all" message (found 0, was
      // looking for 1).
      raiseCouldntFindAll(this.name, String(this.primaryKey), id as unknown[], id, 0, 1);
    }
    return record;
  }

  if (Array.isArray(id)) {
    if (id.length === 0) {
      // Rails `find_with_ids`: `return [] if expects_array && ids.first.empty?`
      // — a *literally* empty array argument short-circuits to `[]` before the
      // `compact.uniq` / size dispatch. (Composite PKs derive `expects_array`
      // from a nested array, so a bare `find([])` there is not an empty-array
      // request.)
      return [];
    }
    // Rails `find_with_ids`: `ids = ids.flatten.compact.uniq` before the
    // `case ids.size` dispatch. `find([1, 1])` collapses to a single id
    // (→ single-id path, wrapped per `expects_array`) and `find([1, nil])`
    // drops the nil. Simple PK only — composite tuples returned above.
    const compactedIds = compactUniqIds(id);
    if (compactedIds.length === 0) {
      // All entries were nil (e.g. `find([nil, nil])`): unlike the empty-input
      // short-circuit above, this passed the `ids.first.empty?` guard and hits
      // Rails' `case ids.size … when 0` → raise "without an ID".
      throw new RecordNotFound(
        `Couldn't find ${this.name} without an ID`,
        this.name,
        String(this.primaryKey),
      );
    }
    if (compactedIds.length === 1) {
      // Rails `find_with_ids` unwraps a single-element array and dispatches to
      // the single-id path (`find_one`): a miss raises the scalar id message
      // (not the aggregate "in [...]"), and a hit is wrapped back into a
      // 1-element array because `expects_array` is true.
      const single = compactedIds[0];
      const record = await this.all()
        .where({ [this.primaryKey as string]: single })
        .first();
      if (!record) {
        throw new RecordNotFound(
          `Couldn't find ${this.name} with '${String(this.primaryKey)}'=${String(single)}`,
          this.name,
          String(this.primaryKey),
          single,
        );
      }
      return [record];
    }
    const records = await this.all()
      .where({ [this.primaryKey as string]: compactedIds })
      .toArray();
    // Rails find_some_ordered casts only for the in_order_of mapping:
    // `ids.map { model.type_for_attribute(primary_key).cast(id) }`
    // (finder_methods.rb:576) — the WHERE ids stay raw for the bind to cast.
    const pkType = this.typeForAttribute(this.primaryKey as string);
    const castIds = compactedIds.map((i) => pkType.cast(i));
    // Key by pkMatchKey so a BigInt PK matches the number/string id passed in
    // (a raw-value Map would miss `1n` vs `1` and spuriously raise below).
    const idToRecord = new Map<unknown, any>();
    for (const r of records) idToRecord.set(pkMatchKey(r.id), r);
    if (records.length !== castIds.length) {
      raiseCouldntFindAll(
        this.name,
        String(this.primaryKey),
        compactedIds,
        compactedIds,
        records.length,
        compactedIds.length,
      );
    }
    // in_order_of: return in input order
    return castIds.map((cid) => idToRecord.get(pkMatchKey(cid))!);
  }
  const record = await this.all()
    .where({ [this.primaryKey as string]: id })
    .first();
  if (!record) {
    throw new RecordNotFound(
      `Couldn't find ${this.name} with '${String(this.primaryKey)}'=${String(id)}`,
      this.name,
      String(this.primaryKey),
      id,
    );
  }
  return record;
}

/**
 * Rails: Core::ClassMethods#find_by (core.rb:283-332) routes a flat-hash lookup
 * through a cached StatementCache, falling back (`super` — the relation path)
 * for scoped lookups, keys that are not real columns, or unsupported
 * (nil/Array/Range/Hash/Relation/Base) values.
 *
 * Before the cache check, Rails resolves each key through attribute_aliases,
 * bails to super on an aggregation, and for a non-polymorphic belongs_to swaps
 * the association name for its join FK column + the value's PK. A plain object
 * value with an `id` is dereferenced to that id.
 */
export async function findBy(this: CoreHost, ...args: any[]): Promise<any> {
  const conditions = args[0];
  // Mirrors Rails core.rb#find_by: `return super if scope_attributes?`, where
  // `scope_attributes?` (scoping/default.rb) is
  // `current_scope || default_scopes.any? || respond_to?(:default_scope)`. A
  // default scope can add includes/references/order the StatementCache fast path
  // can't reproduce (it builds a bare `where(...).limit(1)`), so defer the whole
  // lookup to the relation path, which applies the default scope's eager joins.
  if (this.isScopeAttributes()) {
    return this.all().findBy(...args);
  }
  // Rails: `hash = args.first; return super unless Hash === hash` (core.rb:286-287).
  if (!isPlainObject(conditions)) {
    return this.all().findBy(...args);
  }
  const keys = Object.keys(conditions);
  if (keys.length === 0) return this.all().findBy(conditions);
  await this.ensureSchemaLoaded();
  const aliases: Record<string, string> = (this as any).attributeAliases ?? {};
  const resolvedKeys: string[] = [];
  const values: unknown[] = [];

  for (const rawKey of keys) {
    let key = aliases[rawKey] ?? rawKey;
    let value = conditions[rawKey];

    // Aggregations have no single backing column — defer the whole lookup.
    if (reflectOnAggregation(this as any, key)) return this.all().findBy(conditions);

    const reflection = _reflectOnAssociation(this as any, key);

    if (!reflection) {
      if (respondsToId(value)) value = (value as any).id;
    } else if (reflection.belongsTo() && !reflection.isPolymorphic()) {
      const fk = reflection.joinForeignKey;
      const pkey = reflection.joinPrimaryKey();
      // Composite-key belongs_to yields array key/value pairs the single-column
      // StatementCache below can't bind — defer to the relation path.
      if (Array.isArray(fk) || Array.isArray(pkey)) return this.all().findBy(conditions);
      key = fk;
      if (respondsTo(value, pkey)) value = (value as any)[pkey];
    }

    if (
      !Object.prototype.hasOwnProperty.call(columnsHash.call(this as any), key) ||
      StatementCache.unsupportedValue(value)
    ) {
      return this.all().findBy(conditions);
    }

    resolvedKeys.push(key);
    values.push(value);
  }

  return cachedFindBy.call(this, resolvedKeys, values);
}

function respondsToId(value: unknown): boolean {
  return respondsTo(value, "id");
}

function respondsTo(value: unknown, name: string): boolean {
  return value != null && typeof value === "object" && name in value;
}

/**
 * Rails: Core::ClassMethods#cached_find_by — build (once) and execute a
 * StatementCache keyed by the lookup columns, bucketed by the connection's
 * prepared_statements setting.
 *
 * @internal
 */
async function cachedFindBy(this: CoreHost, keys: string[], values: unknown[]): Promise<any> {
  return withConnection.call(this as any, async (connection: any) => {
    // Rails keys the cache on the array itself (structural equality); we
    // serialize it so ["a","b"] and ["a,b"] don't collide on a "," join.
    const cacheKey = JSON.stringify(keys);
    const statement = cachedFindByStatement.call(this, connection, cacheKey, (params: any) => {
      const wheres: Record<string, unknown> = {};
      for (const key of keys) wheres[key] = params.bind();
      return (this as any).where(wheres).limit(1);
    });
    try {
      const records = await statement.execute(values, connection, { allowRetry: true });
      return records[0] ?? null;
    } catch (e) {
      // An out-of-range value for the column type returns null, matching the
      // relation path's findBy (finder-methods.ts). Rails catches ::RangeError
      // at the bind layer; our typed ActiveModelRangeError is the port of that.
      if (e instanceof ActiveModelRangeError) return null;
      // Rails: rescue TypeError; raise ActiveRecord::StatementInvalid — a bind
      // value that slips past unsupportedValue but fails type coercion surfaces
      // as the AR error callers rescue, not a raw TypeError.
      if (e instanceof TypeError) throw new StatementInvalid(e.message);
      throw e;
    }
  });
}

/** Rails: `find_by!(*args) = find_by(*args) || where(*args).raise_record_not_found_exception!` (core.rb:334-336). */
export async function findByBang(this: CoreHost, ...args: any[]): Promise<any> {
  return (
    (await findBy.call(this, ...args)) ??
    this.all()
      .where(...args)
      .raiseRecordNotFoundExceptionBang()
  );
}
