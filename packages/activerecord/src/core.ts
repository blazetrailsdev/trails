import {
  ArgumentError,
  Concurrent,
  DelegateClass,
  cmp,
  rbClassSuperclass,
  rbEqual,
  rbObjClass,
  rbObjIsKindOf,
  Module,
  hasKey,
  include,
  rbHash,
  rbModConstSet,
  rbModSingletonP,
  rbModToS,
  rbObjHash,
  basicObjRespondTo,
  rbFPublicSend,
  rbObjSingletonClass,
} from "@blazetrails/ruby-compat";
import {
  NameError,
  RecordNotFound,
  StatementInvalid,
  StrictLoadingViolationError,
} from "./errors.js";
import { DatabaseConfigurations, type RawConfigurations } from "./database-configurations.js";
import type { HashConfig } from "./database-configurations/hash-config.js";
import {
  Notifications,
  IsolatedExecutionState,
  ParameterFilter,
  isPlainObject,
  constantize,
  filterMap,
} from "@blazetrails/activesupport";
import { AsynchronousQueriesTracker, type Session } from "./asynchronous-queries-tracker.js";
import { _reflectOnAssociation, reflectOnAggregation } from "./reflection.js";
import { PredicateBuilder } from "./relation/predicate-builder.js";
import { TableMetadata } from "./table-metadata.js";
import type { PrettyPrinter } from "./pretty-print.js";
import { Table } from "@blazetrails/arel";
import { Map as TypeCasterMap } from "./type-caster/map.js";
import { cachedTableExists, columnsHash, isSchemaLoaded } from "./model-schema.js";
import { StatementCache } from "./statement-cache.js";
import { withConnection } from "./connection-handling.js";
import { RangeError as ActiveModelRangeError } from "@blazetrails/activemodel";
import type { AttributeSet, YAMLEncoder } from "@blazetrails/activemodel";
import { LegacyYamlAdapter } from "./legacy-yaml-adapter.js";
import {
  classAttribute,
  included,
  type Callbacks,
  type Included,
} from "@blazetrails/activesupport";
import { ConnectionHandler } from "./connection-adapters/abstract/connection-handler.js";

type FindByStatementCache = Map<boolean, InstanceType<typeof Concurrent.Map<unknown, any>>>;

export interface Core {
  inspect(): string;
  equals(other: unknown): boolean;
  freeze(): this;
  isFrozen(): boolean;
  compare(other: unknown): number | null;
  isPresent(): boolean;
  isBlank(): boolean;
  isReadonly(): boolean;
  readonlyBang(): this;
  isStrictLoading(): boolean;
  strictLoadingBang(value?: boolean, options?: { mode?: StrictLoadingMode }): boolean;
  strictLoadingMode(): StrictLoadingMode;
  isStrictLoadingAll(): boolean;
  isStrictLoadingNPlusOneOnly(): boolean;
}

export const Core = {
  [included](base: object): void {
    include(base as new () => object, SuperMethods);
    classAttribute.call(base, "logger", { instanceWriter: false });
    classAttribute.call(base, "_destroyAssociationAsyncJob", {
      instanceAccessor: false,
      default: "ActiveRecord::DestroyAssociationAsyncJob",
    });
    Object.defineProperty(base, "destroyAssociationAsyncJob", {
      configurable: true,
      get: destroyAssociationAsyncJob,
      set: Object.getOwnPropertyDescriptor(base, "_destroyAssociationAsyncJob")!.set,
    });
    Object.defineProperty((base as CoreHost).prototype, "destroyAssociationAsyncJob", {
      configurable: true,
      get(this: { constructor: CoreHost }) {
        return this.constructor.destroyAssociationAsyncJob;
      },
    });
    classAttribute.call(base, "destroyAssociationAsyncBatchSize", {
      instanceWriter: false,
      instancePredicate: false,
      default: null,
    });
    classAttribute.call(base, "enumerateColumnsInSelectStatements", {
      instanceAccessor: false,
      default: false,
    });
    classAttribute.call(base, "belongsToRequiredByDefault", { instanceAccessor: false });
    classAttribute.call(base, "strictLoadingByDefault", {
      instanceAccessor: false,
      default: false,
    });
    classAttribute.call(base, "strictLoadingMode", { instanceAccessor: false, default: "all" });
    classAttribute.call(base, "hasManyInversing", { instanceAccessor: false, default: false });
    classAttribute.call(base, "runCommitCallbacksOnFirstSavedInstancesInTransaction", {
      instanceAccessor: false,
      default: true,
    });
    classAttribute.call(base, "defaultConnectionHandler", { instanceWriter: false });
    classAttribute.call(base, "defaultRole", { instanceWriter: false });
    classAttribute.call(base, "defaultShard", { instanceWriter: false });
    classAttribute.call(base, "shardSelector", { instanceAccessor: false, default: null });
    classAttribute.call(base, "attributesForInspect", { instanceAccessor: false, default: ":all" });

    (base as CoreHost).filterAttributes = [];

    Object.defineProperty(base, "connectionClass", {
      configurable: true,
      get: connectionClass,
      set(this: CoreHost, b: boolean) {
        this._connectionClass = b;
      },
    });

    (base as { defaultConnectionHandler: ConnectionHandler }).defaultConnectionHandler =
      new ConnectionHandler();
    (base as { defaultRole: string }).defaultRole = writingRole();
    (base as { defaultShard: string }).defaultShard = "default";
  },
};

import { ActiveRecord } from "./namespaces.js";
import {
  actionOnStrictLoadingViolation,
  applicationRecordClass,
  writingRole,
} from "./active-record.js";

type FilterAttributes = (string | RegExp | ((key: string, value: unknown) => unknown))[];

export class ClassMethods {
  static get filterAttributes(): FilterAttributes {
    const host = this as unknown as CoreHost;
    if (
      !Object.prototype.hasOwnProperty.call(host, "_filterAttributes") ||
      host._filterAttributes == null
    ) {
      return parentClass(host)!.filterAttributes;
    } else {
      return host._filterAttributes;
    }
  }

  static set filterAttributes(filterAttributes: FilterAttributes) {
    const host = this as unknown as CoreHost;
    host._inspectionFilter = null;
    host._filterAttributes = filterAttributes;
  }

  static inspectionFilter(): ParameterFilter {
    const host = this as unknown as CoreHost;
    const filterAttributes = Object.hasOwn(host, "_filterAttributes")
      ? host._filterAttributes
      : null;
    if (filterAttributes == null) {
      return rbClassSuperclass(host)!.inspectionFilter();
    } else {
      return (
        (Object.hasOwn(host, "_inspectionFilter") ? host._inspectionFilter : null) ||
        (host._inspectionFilter = (() => {
          const mask = new InspectionMask(ParameterFilter.FILTERED);
          return new ParameterFilter(filterAttributes, { mask });
        })())
      );
    }
  }

  /** @missingRailsCall table_exists? — PERMANENT */
  static inspect(
    this: (abstract new (...args: never) => unknown) & {
      abstractClass: boolean;
      isConnected(): boolean;
      attributeTypes(): Record<string, { type(): string | null | undefined } | null>;
    },
  ): string {
    const name = rbModSingletonP(this)
      ? rbModToS(this)
      : this === ActiveRecord.Base
        ? "ActiveRecord::Base"
        : this.name;
    if (this === ActiveRecord.Base || rbModSingletonP(this)) {
      return name;
    } else if (this.abstractClass) {
      return `${name}(abstract)`;
    } else if (!isSchemaLoaded.call(this as never) && !this.isConnected()) {
      return `${name} (call '${name}.load_schema' to load schema informations)`;
    } else if (cachedTableExists.call(this as never)) {
      const attrList = Object.entries(this.attributeTypes())
        .map(([name, type]) => `${name}: ${type!.type() ?? ""}`)
        .join(", ");
      return `${name}(${attrList})`;
    } else {
      return `${name}(Table doesn't exist)`;
    }
  }
}

interface CoreRecord {
  id: unknown;
  _attributes: AttributeSet;
  _newRecord: boolean;
  readAttribute(name: string): unknown;
  isPersisted(): boolean;
}

export function inspect(this: CoreRecord): string {
  return inspectWithAttributes.call(this as any, attributesForInspect.call(this));
}

export async function prettyPrint(
  this: CoreRecord & {
    _attributes: any;
    _hasAttribute(attrName: string): boolean;
    constructor: { prototype: object };
  },
  pp: PrettyPrinter,
): Promise<void> {
  if (isCustomInspectMethodDefined.call(this)) {
    pp.text((this as unknown as { inspect(): string }).inspect());
    return;
  }
  await pp.objectAddressGroup(this as object, async () => {
    if (!this._attributes) {
      pp.breakable(" ");
      pp.text("not initialized");
      return;
    }
    const attrNames = attributesForInspect.call(this).filter((name) => this._hasAttribute(name));
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

export function equals(this: CoreRecord, comparisonObject: unknown): boolean {
  return (
    this === comparisonObject ||
    (rbObjClass(comparisonObject) === rbObjClass(this) &&
      (this as unknown as { isPrimaryKeyValuesPresent(): boolean }).isPrimaryKeyValuesPresent() &&
      rbEqual((comparisonObject as CoreRecord).id, this.id))
  );
}

export const eql = equals;

export function hash(this: CoreRecord): number {
  const id = this.id;

  if ((this as unknown as { isPrimaryKeyValuesPresent(): boolean }).isPrimaryKeyValuesPresent()) {
    return rbHash(this.constructor) ^ rbHash(id);
  } else {
    return rbObjHash(this);
  }
}

export function freeze<T extends FrozenRecord>(this: T): T {
  this._attributes = this._attributes.deepDup().freeze();
  return this;
}

/** @missingRailsName attributes — PERMANENT */
export function isFrozen(this: FrozenRecord): boolean {
  return Object.isFrozen(this._attributes);
}

export function compare(this: CoreRecord, otherObject: unknown): number | null {
  if (rbObjIsKindOf(otherObject, this.constructor)) {
    return cmp(
      (this as unknown as ComparableRecord).toKey(),
      (otherObject as ComparableRecord).toKey(),
    );
  } else {
    return cmp(this, otherObject);
  }
}

interface ComparableRecord {
  toKey(): unknown[] | null;
}

export function isPresent(this: CoreRecord): boolean {
  return this.isPersisted();
}

export function isBlank(this: CoreRecord): boolean {
  return !isPresent.call(this);
}

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

export function isReadonly(this: ReadonlyFields): boolean {
  return this._readonly;
}

export function readonlyBang<T extends ReadonlyFields>(this: T): T {
  this._readonly = true;
  return this;
}

export function isStrictLoading(this: StrictLoadingFields): boolean {
  return this._strictLoading;
}

export function strictLoadingBang<T extends StrictLoadingFields>(
  this: T,
  value: boolean = true,
  options: { mode?: StrictLoadingMode } = {},
): boolean {
  const mode = options.mode ?? "all";
  if (mode !== "all" && mode !== "n_plus_one_only") {
    throw new ArgumentError(
      `The :mode option must be one of ["all", "n_plus_one_only"] but ${JSON.stringify(mode)} was provided.`,
    );
  }
  this._strictLoadingMode = mode;
  this._strictLoading = value;
  return value;
}

type YamlHost = { yamlEncoder(): YAMLEncoder };

/**
 * @inventedArm loop — PERMANENT
 * @inventedArm if — PERMANENT
 * @inventedArm keys — PERMANENT
 * @inventedArm basicObjRespondTo — PERMANENT
 * @inventedArm rbObjSingletonClass — PERMANENT
 * @inventedArm defineAttributeMethod — PERMANENT
 */
export function initWith(
  this: CoreRecord & {
    initWithAttributes(attributes: unknown, newRecord: boolean, block?: unknown): unknown;
  },
  coder: Record<string, unknown>,
  block?: (record: CoreRecord) => void,
): void {
  coder = LegacyYamlAdapter.convert(coder);
  const attributes = (this.constructor as unknown as YamlHost).yamlEncoder().decode(coder);
  for (const name of attributes.keys()) {
    if (!basicObjRespondTo(this, name, false)) {
      (
        rbObjSingletonClass(this) as unknown as { defineAttributeMethod(name: string): void }
      ).defineAttributeMethod(name);
    }
  }
  this.initWithAttributes(attributes, coder["new_record"] as boolean, block);
}

export function initWithAttributes<T extends CoreRecord>(
  this: T & {
    _attributes: any;
    _newRecord: boolean;
    initInternals(): void;
    runCallbacks: Included<typeof Callbacks>["runCallbacks"];
  },
  attributes: any,
  newRecord = false,
  block?: (record: T) => void,
): T {
  this._newRecord = newRecord;
  this._attributes = attributes;
  this.initInternals();

  block?.(this);

  void this.runCallbacks("find", undefined, { strict: "sync" });
  void this.runCallbacks("initialize", undefined, { strict: "sync" });

  return this;
}

export function initAttributes(
  this: CoreRecord & {
    _attributes: any;
    _primaryKey?: string | string[] | null;
    constructor: { compositePrimaryKey: boolean };
  },
  _: unknown,
): any {
  const attrs = this._attributes.deepDup();

  if (this.constructor.compositePrimaryKey) {
    for (const key of this._primaryKey as string[]) attrs.reset(key);
  } else {
    attrs.reset(this._primaryKey);
  }

  return attrs;
}

type StrictLoadingModeHost = CoreRecord & { _strictLoadingMode?: StrictLoadingMode };

/** @missingRailsName attributes — PERMANENT */
export function encodeWith(
  this: CoreRecord & { _attributes: AttributeSet; isNewRecord(): boolean },
  coder: Record<string, unknown>,
): void {
  (this.constructor as unknown as YamlHost).yamlEncoder().encode(this._attributes, coder);
  coder["new_record"] = this.isNewRecord();
  coder["active_record_yaml_version"] = 2;
}

export function strictLoadingMode(this: StrictLoadingModeHost): StrictLoadingMode {
  return this._strictLoadingMode ?? "all";
}

export function isStrictLoadingNPlusOneOnly(this: StrictLoadingModeHost): boolean {
  return strictLoadingMode.call(this) === "n_plus_one_only";
}

export function isStrictLoadingAll(this: StrictLoadingModeHost): boolean {
  return strictLoadingMode.call(this) === "all";
}

export function fullInspect(this: CoreRecord): string {
  return inspectWithAttributes.call(this as any, allAttributesForInspect.call(this));
}

interface CoreHost {
  name: string;
  tableName?: string | null;
  primaryKey?: string | string[];
  compositePrimaryKey?: boolean;
  filterAttributes: FilterAttributes;
  _filterAttributes?: FilterAttributes;
  _inspectionFilter?: any;
  inspectionFilter(): ParameterFilter;
  _connectionClass?: boolean;
  _destroyAssociationAsyncJob?: any;
  destroyAssociationAsyncJob?: any;
  _findByStatementCache?: FindByStatementCache;
  initializeFindByCache(): FindByStatementCache;
  _generatedAssociationMethods?: Module;
  _predicateBuilder?: any;
  arelTable?: any;
  prototype: any;
  all(): any;
  isScopeAttributes(): boolean;
  typeForAttribute(name: string): { cast(value: unknown): unknown } | null;
  ensureSchemaLoaded(): Promise<void>;
}

function parentClass(klass: CoreHost): CoreHost | null {
  const proto = Object.getPrototypeOf(klass);
  return typeof proto === "function" ? (proto as CoreHost) : null;
}

export function destroyAssociationAsyncJob(this: CoreHost): any {
  try {
    if (typeof this._destroyAssociationAsyncJob === "string") {
      this._destroyAssociationAsyncJob = constantize(this._destroyAssociationAsyncJob);
    }
    return this._destroyAssociationAsyncJob;
  } catch (error) {
    if (!(error instanceof NameError)) throw error;
    throw new NameError(`Unable to load destroy_association_async_job: ${error.message}`);
  }
}

let _configurations!: DatabaseConfigurations;

export function configurations(
  config?: RawConfigurations | DatabaseConfigurations | HashConfig[],
): DatabaseConfigurations {
  if (config !== undefined) {
    _configurations = new DatabaseConfigurations(config);
  }
  return _configurations;
}

export function isApplicationRecordClass(this: CoreHost): boolean | undefined {
  if (applicationRecordClass() != null) {
    return (this as unknown) === applicationRecordClass();
  } else {
    const ApplicationRecord = (globalThis as Record<string, unknown>)["ApplicationRecord"];
    if (ApplicationRecord !== undefined && (this as unknown) === ApplicationRecord) {
      return true;
    }
  }
}

export type ConnectedToEntry = {
  role?: string;
  shard?: string;
  klasses: any[];
  preventWrites?: boolean;
};

const CONNECTED_TO_STACK_KEY = Symbol.for("ar_connected_to_stack");

export function connectedToStack(): ConnectedToEntry[] {
  let connectedToStack = IsolatedExecutionState.get<ConnectedToEntry[]>(CONNECTED_TO_STACK_KEY);
  if (connectedToStack != null) {
    return connectedToStack;
  } else {
    connectedToStack = [];
    IsolatedExecutionState.set(CONNECTED_TO_STACK_KEY, connectedToStack);
    return connectedToStack;
  }
}

export function currentRole(this: CoreHost): string {
  const stack = connectedToStack();
  for (let i = stack.length - 1; i >= 0; i--) {
    const hash = stack[i];
    if (hash.role && hash.klasses.includes(ActiveRecord.Base)) return hash.role;
    if (hash.role && hash.klasses.includes(connectionClassForSelf.call(this))) return hash.role;
  }

  return (this as CoreHost & { defaultRole: string }).defaultRole;
}

export function currentShard(this: CoreHost): string {
  const stack = connectedToStack();
  for (let i = stack.length - 1; i >= 0; i--) {
    const hash = stack[i];
    if (hash.shard && hash.klasses.includes(ActiveRecord.Base)) return hash.shard;
    if (hash.shard && hash.klasses.includes(connectionClassForSelf.call(this))) return hash.shard;
  }

  return (this as CoreHost & { defaultShard: string }).defaultShard;
}

export function currentPreventingWrites(this: CoreHost): boolean {
  const stack = connectedToStack();
  for (let i = stack.length - 1; i >= 0; i--) {
    const hash = stack[i];
    if (hash.preventWrites !== undefined && hash.klasses.includes(ActiveRecord.Base))
      return hash.preventWrites;
    if (
      hash.preventWrites !== undefined &&
      hash.klasses.includes(connectionClassForSelf.call(this))
    )
      return hash.preventWrites;
  }

  return false;
}

export function isPreventingWrites(className?: string): boolean {
  const stack = connectedToStack();
  for (let i = stack.length - 1; i >= 0; i--) {
    const hash = stack[i];
    if (hash.preventWrites !== undefined && hash.klasses.includes(ActiveRecord.Base))
      return hash.preventWrites;
    if (
      hash.preventWrites !== undefined &&
      hash.klasses.some((klass) => typeof klass === "function" && klass.name === className)
    )
      return hash.preventWrites;
  }

  return false;
}

export function connectionClass(this: CoreHost): boolean {
  return (
    (Object.hasOwn(this, "_connectionClass") ? this._connectionClass : undefined) ||
    (this._connectionClass = false)
  );
}

export function isConnectionClass(this: CoreHost): boolean {
  return connectionClass.call(this);
}

export function connectionClassForSelf(this: CoreHost): CoreHost {
  let klass: CoreHost = this;

  while ((klass as unknown) !== ActiveRecord.Base) {
    if (isConnectionClass.call(klass)) break;
    klass = rbClassSuperclass(klass)!;
  }

  return klass;
}

export function asynchronousQueriesTracker(): AsynchronousQueriesTracker {
  return (
    IsolatedExecutionState.get<AsynchronousQueriesTracker>(ASYNCHRONOUS_QUERIES_TRACKER_KEY) ??
    IsolatedExecutionState.set(ASYNCHRONOUS_QUERIES_TRACKER_KEY, new AsynchronousQueriesTracker())
  );
}

const ASYNCHRONOUS_QUERIES_TRACKER_KEY = "active_record_asynchronous_queries_tracker";

export function asynchronousQueriesSession(): Session {
  return asynchronousQueriesTracker().currentSession;
}

export function strictLoadingViolationBang({
  owner,
  reflection,
}: {
  owner: unknown;
  reflection: { name: string; strictLoadingViolationMessage(owner: unknown): string };
}): void {
  switch (actionOnStrictLoadingViolation()) {
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

export function initializeFindByCache(this: CoreHost): FindByStatementCache {
  return (this._findByStatementCache = new Map([
    [true, new Concurrent.Map()],
    [false, new Concurrent.Map()],
  ]));
}

export function initializeGeneratedModules(this: CoreHost): void {
  generatedAssociationMethods.call(this);
}

/**
 * @inventedArm if — CONVERGEABLE core-inherited-seeding-leaves-the-generated-modules-and-find-by-cache-readers
 * @inventedArm initializeGeneratedModules — CONVERGEABLE core-inherited-seeding-leaves-the-generated-modules-and-find-by-cache-readers
 */
export function generatedAssociationMethods(this: CoreHost): Module {
  if (!Object.hasOwn(this, "_generatedAttributeMethods")) {
    (this as unknown as { initializeGeneratedModules(): void }).initializeGeneratedModules();
  }
  return (
    (Object.hasOwn(this, "_generatedAssociationMethods")
      ? this._generatedAssociationMethods
      : undefined) ||
    (this._generatedAssociationMethods = (() => {
      const mod = rbModConstSet(
        this as unknown as new (...args: unknown[]) => unknown,
        "GeneratedAssociationMethods",
        new Module(),
      );
      include(this as unknown as new (...args: unknown[]) => unknown, mod);

      return mod;
    })())
  );
}

export function predicateBuilder(this: CoreHost): PredicateBuilder {
  return (
    (Object.hasOwn(this, "_predicateBuilder") ? this._predicateBuilder : undefined) ||
    (this._predicateBuilder = new PredicateBuilder(new TableMetadata(this as any, this.arelTable)))
  );
}

export function typeCaster(this: CoreHost): TypeCasterMap {
  return new TypeCasterMap(this);
}

/** @inventedArm initializeFindByCache — CONVERGEABLE core-inherited-seeding-leaves-the-generated-modules-and-find-by-cache-readers */
export function cachedFindByStatement(
  this: CoreHost,
  connection: any,
  key: unknown,
  block: (params: any) => any,
): any {
  const cache = (
    (Object.hasOwn(this, "_findByStatementCache") ? this._findByStatementCache : undefined) ||
    this.initializeFindByCache()
  ).get(connection.preparedStatements)!;
  return cache.computeIfAbsent(key, () => StatementCache.create(connection, block));
}

export function inspectionFilter(this: { constructor: CoreHost }): ParameterFilter {
  return this.constructor.inspectionFilter();
}

export function connectionHandler(this: CoreHost): ConnectionHandler {
  return (
    IsolatedExecutionState.get<ConnectionHandler>(ACTIVE_RECORD_CONNECTION_HANDLER_KEY) ??
    (this as CoreHost & { defaultConnectionHandler: ConnectionHandler }).defaultConnectionHandler
  );
}

export function setConnectionHandler(this: CoreHost, handler: ConnectionHandler): void {
  IsolatedExecutionState.set(ACTIVE_RECORD_CONNECTION_HANDLER_KEY, handler);
}

const ACTIVE_RECORD_CONNECTION_HANDLER_KEY = "active_record_connection_handler";

export function arelTable(this: CoreHost): Table {
  return new Table((this as any).tableName, { klass: this as any });
}

/** @internal */
export const _allocation: { klass: unknown } = { klass: null };

/** @inventedArm if — CONVERGEABLE base-allocate-comes-from-a-ruby-compat-rb-obj-alloc */
export function constructor(
  this: CoreRecord & {
    _attributes: import("@blazetrails/activemodel").AttributeSet;
    _newRecord: boolean;
    initInternals(): void;
  },
  attributes: unknown = null,
  block?: (record: CoreRecord) => void,
): void {
  const allocating = _allocation.klass === this.constructor;
  if (allocating) _allocation.klass = null;
  if (!allocating) {
    this._newRecord = true;
    this._attributes = (
      this.constructor as unknown as {
        _defaultAttributes(): import("@blazetrails/activemodel").AttributeSet;
      }
    )
      ._defaultAttributes()
      .deepDup();
  }

  this.initInternals();

  SuperMethods.superMethod(this, "initialize")!(attributes);

  if (block) block(this);
}

/** @internal */
export function initInternals(
  this: CoreRecord & {
    _attributes: import("@blazetrails/activemodel").AttributeSet;
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
): void {
  this._readonly = false;
  this._previouslyNewRecord = false;
  this._destroyed = false;
  this._markedForDestruction = false;
  this._destroyedByAssociation = null;
  this._startTransactionState = null;
  const klass = this.constructor as any;
  this._primaryKey = klass.primaryKey;
  this._strictLoading = klass.strictLoadingByDefault ?? false;
  this._strictLoadingMode = klass.strictLoadingMode;

  klass.defineAttributeMethods();
}

const SuperMethods = new Module((mod) => {
  mod.defineMethod("initialize", constructor);
  mod.defineMethod("initInternals", initInternals);
});

export function initializeDup(
  this: CoreRecord & {
    _attributes: any;
    _newRecord: boolean;
    _previouslyNewRecord: boolean;
    _destroyed: boolean;
    _startTransactionState: unknown;
    runCallbacks: Included<typeof Callbacks>["runCallbacks"];
  },
  super_: (other: unknown) => void,
  other: unknown,
): void {
  this._attributes = (
    this as unknown as { initAttributes(other: unknown): unknown }
  ).initAttributes(other);
  super_(other);
  void this.runCallbacks("initialize", undefined, { strict: "sync" });
  this._newRecord = true;
  this._previouslyNewRecord = false;
  this._destroyed = false;
  this._startTransactionState = null;
}

interface CloneRecord {
  _attributes: unknown;
  _previouslyNewRecord: boolean;
  errors: { constructor: new (base: unknown) => unknown };
}

/** @noRailsEquivalent CONVERGEABLE adopt-rbobjdup-rbobjclone-at-remaining-copy-sites */
export function clone<T extends CloneRecord>(this: T): T {
  const copy = Object.create(Object.getPrototypeOf(this)) as T;
  Object.assign(copy, this);
  (copy as unknown as CloneRecord)._attributes = this._attributes;
  (copy as unknown as CloneRecord)._previouslyNewRecord = false;
  (copy as unknown as { _errors: unknown })._errors = new this.errors.constructor(copy);
  return copy;
}

/** @internal */
export function initializeInternalsCallback(this: unknown): void {}

/** @internal */
export function isCustomInspectMethodDefined(this: {
  constructor: { prototype: object };
}): boolean {
  return Object.prototype.hasOwnProperty.call(this.constructor.prototype, "inspect");
}

/** @internal */
export function inspectWithAttributes(
  this: CoreRecord & { _attributes: any; _hasAttribute(attrName: string): boolean },
  attributesToList: string[],
): string {
  const inspection = this._attributes
    ? filterMap(attributesToList, (name) => {
        name = String(name);
        if (this._hasAttribute(name)) {
          return `${name}: ${(this as unknown as { attributeForInspect(attr: string): string }).attributeForInspect(name)}`;
        }
      }).join(", ")
    : "not initialized";

  return `#<${(this.constructor as { name: string }).name} ${inspection}>`;
}

export function attributesForInspect(this: CoreRecord): string[] {
  const klass = this.constructor as unknown as { attributesForInspect: ":all" | string[] };
  return klass.attributesForInspect === ":all"
    ? allAttributesForInspect.call(this)
    : klass.attributesForInspect;
}

/** @internal */
export function allAttributesForInspect(this: CoreRecord): string[] {
  if (!this._attributes) return [];
  return (this as unknown as { attributeNames(): string[] }).attributeNames();
}

/** @internal */
function relation(this: CoreHost): any {
  return (this as any).all();
}

export function find(this: CoreHost, block: (record: any) => unknown): Promise<any>;
export function find(this: CoreHost, ...ids: unknown[]): Promise<any>;
export async function find(this: CoreHost, ...ids: unknown[]): Promise<any> {
  await this.ensureSchemaLoaded();
  if (ids.length !== 1) return this.all().find(...ids);
  if (
    typeof ids[ids.length - 1] === "function" ||
    this.primaryKey == null ||
    this.isScopeAttributes()
  ) {
    return this.all().find(...ids);
  }

  const id = ids[0];

  if (StatementCache.unsupportedValue(id)) return this.all().find(...ids);

  const primaryKey = this.primaryKey as string;
  const record = await cachedFindBy.call(this, [primaryKey], [id]);
  if (record) return record;
  throw new RecordNotFound(
    `Couldn't find ${this.name} with '${primaryKey}'=${String(id)}`,
    this.name,
    primaryKey,
    id,
  );
}

export async function findBy(this: CoreHost, ...args: any[]): Promise<any> {
  const conditions = args[0];
  if (this.isScopeAttributes()) {
    return this.all().findBy(...args);
  }
  if (!isPlainObject(conditions)) {
    return this.all().findBy(...args);
  }
  const keys = Object.keys(conditions);
  await this.ensureSchemaLoaded();
  const aliases: Record<string, string> = (this as any).attributeAliases ?? {};
  const resolvedKeys: (string | string[])[] = [];
  const values: unknown[] = [];

  for (const rawKey of keys) {
    let key: string | string[] = aliases[rawKey] ?? rawKey;
    let value = conditions[rawKey];
    let compositePrimaryKey = false;

    if (reflectOnAggregation(this as any, key)) return this.all().findBy(conditions);

    const reflection = _reflectOnAssociation(this as any, key);

    if (!reflection) {
      if (respondsToId(value)) value = (value as any).id;
    } else if (reflection.belongsTo() && !reflection.isPolymorphic()) {
      key = reflection.joinForeignKey;
      const pkey = reflection.joinPrimaryKey();

      if (Array.isArray(pkey)) {
        if (pkey.every((attribute) => respondsTo(value, attribute))) {
          value = pkey.map((attribute) => {
            if (attribute === "id") {
              return (value as any).id_value;
            } else {
              return rbFPublicSend(value, attribute);
            }
          });
          compositePrimaryKey = true;
        }
      } else {
        if (respondsTo(value, pkey)) value = rbFPublicSend(value, pkey);
      }
    }

    if (
      !compositePrimaryKey &&
      (!hasKey(columnsHash.call(this as any), key as string) ||
        StatementCache.unsupportedValue(value))
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

/** @internal */
async function cachedFindBy(
  this: CoreHost,
  keys: (string | string[])[],
  values: unknown[],
): Promise<any> {
  return withConnection.call(this as any, async (connection: any) => {
    const statement = cachedFindByStatement.call(this, connection, keys, (params: any) => {
      const wheres = new Map<string | string[], unknown>();
      for (const key of keys) {
        if (Array.isArray(key)) {
          wheres.set(key, [key.map(() => params.bind())]);
        } else {
          wheres.set(key, params.bind());
        }
      }
      return (this as any).where(wheres).limit(1);
    });
    try {
      const records = await statement.execute(values.flat(), connection, { allowRetry: true });
      return records[0] ?? null;
    } catch (e) {
      if (e instanceof ActiveModelRangeError) return null;
      if (e instanceof TypeError) throw new StatementInvalid(e.message);
      throw e;
    }
  });
}

export async function findByBang(this: CoreHost, ...args: any[]): Promise<any> {
  return (
    (await findBy.call(this, ...args)) ??
    this.all()
      .where(...args)
      .raiseRecordNotFoundExceptionBang()
  );
}

/** @internal */
export class InspectionMask extends DelegateClass(String) {
  prettyPrint(pp: PrettyPrinter): void {
    pp.text(String(this.__getobj__()));
  }
}
