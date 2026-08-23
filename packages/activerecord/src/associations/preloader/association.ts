import { wrap } from "@blazetrails/activesupport";
import type { Base } from "../../base.js";
import type { AssociationReflection, ThroughReflection } from "../../reflection.js";
import { ConnectionNotDefined } from "../../errors.js";
import { _wireInverseAssociation } from "../../associations.js";

type AssociationLikeReflection = AssociationReflection | ThroughReflection;

const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_SAFE_BIGINT = BigInt(Number.MIN_SAFE_INTEGER);

/**
 * Handles preloading a single association for a group of records.
 * Queries the database, maps results to owners by key, and associates
 * the loaded records to each owner's association target.
 *
 * Mirrors: ActiveRecord::Associations::Preloader::Association
 */
export class Association {
  readonly klass: typeof Base;
  /** @internal */
  readonly owners: Base[];
  /** @internal */
  readonly reflection: AssociationLikeReflection;
  /** @internal */
  protected preloadScope: any;
  private _reflectionScope: any;
  private _associate: boolean;
  private _model: typeof Base | null;
  private _run: boolean;
  /** @internal */
  protected _recordsByOwner: Map<Base, Base[]> | undefined;
  private _preloadedRecords: Base[] | undefined;
  private _ownersByKey: Map<unknown, Base[]> | undefined;
  private _scope: any;
  private _keyConversionRequired: boolean | undefined;

  constructor(
    klass: typeof Base,
    owners: Base[],
    reflection: AssociationLikeReflection,
    preloadScope?: any,
    reflectionScope?: any,
    associateByDefault: boolean = true,
  ) {
    this.klass = klass;
    this.owners = this._uniqueOwners(owners);
    this.reflection = reflection;
    this.preloadScope = preloadScope ?? null;
    this._reflectionScope = reflectionScope ?? null;
    this._associate = associateByDefault || preloadScope == null;
    this._model = owners.length > 0 ? (owners[0].constructor as typeof Base) : null;
    this._run = false;
  }

  get tableName(): string {
    return this.klass.tableName;
  }

  async futureClasses(): Promise<(typeof Base)[]> {
    if (this.isRun()) return [];
    return [this.klass];
  }

  async runnableLoaders(): Promise<Association[]> {
    return [this];
  }

  isRun(): boolean {
    return this._run;
  }

  async run(): Promise<this> {
    if (this.isRun()) return this;
    this._run = true;

    const records = await this.recordsByOwner();

    if (this._associate) {
      for (const owner of this.owners) {
        this.associateRecordsToOwner(owner, records.get(owner) ?? []);
      }
    }

    return this;
  }

  async recordsByOwner(): Promise<Map<Base, Base[]>> {
    if (this._recordsByOwner === undefined) {
      await this.loadRecords();
    }
    return this._recordsByOwner!;
  }

  /** Mirrors: Preloader::Association#preloaded_records
   *  (`preloader/association.rb:153-157`) — the reader forces the preload
   *  query on first access. Ruby's `defined?(@preloaded_records)` is an
   *  assignment check, so the guard is on the backing field being unassigned:
   *  a legitimately-empty preload must not re-run the query. */
  async preloadedRecords(): Promise<Base[]> {
    if (this._preloadedRecords === undefined) {
      await this.loadRecords();
    }
    return this._preloadedRecords!;
  }

  get associationKeyName(): string | string[] {
    // preloader/association.rb:162 `reflection.join_primary_key(klass)` — the
    // klass matters: a polymorphic reflection resolves its primary key against
    // the concrete class the preloader is loading (reflection.rb:944-946).
    return (this.reflection as any).joinPrimaryKey(this.klass);
  }

  loaderQuery(): LoaderQuery {
    return new LoaderQuery(this.scope, this.associationKeyName);
  }

  get ownersByKey(): Map<unknown, Base[]> {
    if (this._ownersByKey !== undefined) return this._ownersByKey;

    this._ownersByKey = new Map();
    for (const owner of this.owners) {
      const key = this.deriveKey(owner, this.ownerKeyName);
      if (key == null) continue;
      const existing = this._ownersByKey.get(key);
      if (existing) {
        existing.push(owner);
      } else {
        this._ownersByKey.set(key, [owner]);
      }
    }
    return this._ownersByKey;
  }

  isLoaded(owner: Base): boolean {
    try {
      return (owner as any).association(this.reflection.name).loaded;
    } catch {
      return false;
    }
  }

  targetFor(owner: Base): Base[] {
    try {
      return wrap((owner as any).association(this.reflection.name).target);
    } catch {
      return [];
    }
  }

  get scope(): any {
    if (this._scope !== undefined) return this._scope;
    this._scope = this.buildScope();
    return this._scope;
  }

  setInverse(record: Base): void {
    const key = this.deriveKey(record, this.associationKeyName);
    const owners = this.ownersByKey.get(key);
    if (owners && owners.length > 0) {
      try {
        const association = (owners[0] as any).association(this.reflection.name);
        association.setInverseInstance(record);
      } catch {}
    }
  }

  async loadRecords(rawRecords?: Base[]): Promise<void> {
    this._recordsByOwner = new Map();

    rawRecords ||= await this.loaderQuery().recordsFor([this]);

    this._preloadedRecords = rawRecords.filter((record) => {
      let assignments = false;
      const key = this.deriveKey(record, this.associationKeyName);
      const owners = this.ownersByKey.get(key);

      if (owners) {
        for (const owner of owners) {
          let entries = this._recordsByOwner!.get(owner);
          if (!entries) {
            entries = [];
            this._recordsByOwner!.set(owner, entries);
          }

          if ((this.reflection as any).isCollection?.() || entries.length === 0) {
            entries.push(record);
            assignments = true;
          }
        }
      }
      return assignments;
    });
  }

  associateRecordsFromUnscoped(unscopedRecords: Base[] | undefined): void {
    if (!unscopedRecords || unscopedRecords.length === 0) return;
    if (!this.reflectionScope.isEmptyScope) return;
    if (this.preloadScope && !this.preloadScope.isEmptyScope) return;
    if ((this.reflection as any).isCollection?.()) return;

    for (const record of unscopedRecords) {
      const key = this.deriveKey(record, this.associationKeyName);
      if (key == null) continue;

      const owners = this.ownersByKey.get(key);
      if (!owners) continue;

      for (let i = 0; i < owners.length; i++) {
        const owner = owners[i];
        try {
          const association = (owner as any).association(this.reflection.name);
          association._setTargetFromLoader(record);
          association._loadedFromPreload = true;
          if (i === 0) {
            association.setInverseInstance(record);
          }
        } catch {}
      }
    }
  }

  /** Mirrors: Preloader::Association#model — `attr_reader :model` over `@model`
   *  (`preloader/association.rb:239`). */
  private get model(): typeof Base | null {
    return this._model;
  }

  /** Mirrors: Preloader::Association#owner_key_name
   *  (`preloader/association.rb:241-243`). */
  private get ownerKeyName(): string | string[] {
    return (this.reflection as any).joinForeignKey;
  }

  private associateRecordsToOwner(owner: Base, records: Base[]): void {
    if (this.isLoaded(owner)) return;

    const association = (owner as any).association(this.reflection.name);
    const isCollection = (this.reflection as any).isCollection?.() ?? false;
    let value: Base | Base[] | null;
    if (isCollection) {
      const currentTarget: Base[] = Array.isArray(association.target) ? association.target : [];
      const notPersistedRecords = currentTarget.filter((r) => !(r as any).isPersisted());
      value = [...records, ...notPersistedRecords];
      association._setTargetFromLoader(value);
    } else {
      value = records[0] ?? null;
      association._setTargetFromLoader(value);
    }
    association._loadedFromPreload = true;

    // Route through `reflection.inverseName()` so automatic inverse detection
    // (via `automaticInverseOf()`, made functional by C1) fires for non-rich
    // reflections too — not just when `inverseOf` is explicitly configured.
    // Mirrors Rails' `Preloader::Association#associate_records_to_owner`, which
    // consults `reflection.inverse_of` (→ `inverse_name`).
    let inverseName: string | undefined;
    try {
      inverseName =
        (this.reflection as any).inverseName?.() ?? (this.reflection as any).options?.inverseOf;
    } catch {
      inverseName = (this.reflection as any).options?.inverseOf;
    }
    if (inverseName) {
      // Route through the shared inverse-wiring helper rather than poking the
      // association cache directly. For a belongs_to inverse it caches the
      // owner scalar (unchanged); for a has_many inverse it populates the
      // child's collection proxy target — the single write path for has_many
      // targets. Mirrors Rails' `add_to_target` → `set_inverse_instance`, where
      // preloaded and inverse-wired records both land in `@target`.
      for (const child of records) {
        _wireInverseAssociation(owner, child, inverseName);
      }
    }
  }

  private deriveKey(record: Base, key: string | string[]): unknown {
    if (Array.isArray(key)) {
      return JSON.stringify(key.map((k) => this.convertKey((record as any)._readAttribute(k))));
    }
    return this.convertKey((record as any)._readAttribute(key));
  }

  private convertKey(key: unknown): unknown {
    if (key == null) return key;
    if (this.isKeyConversionRequired()) return String(key);
    // node-postgres parses int8 (a bigserial PK) to BigInt and int4 (an
    // integer/references FK) to number, so an owner PK `1n` and a child FK `1`
    // are distinct JS Map keys even though Ruby compares them equal (Integer ==
    // is width-agnostic). Normalize both sides to a number when the value fits,
    // so the owner/child lookup keys collide as they do in Rails.
    if (typeof key === "bigint") {
      return key >= MIN_SAFE_BIGINT && key <= MAX_SAFE_BIGINT ? Number(key) : key.toString();
    }
    return key;
  }

  private isKeyConversionRequired(): boolean {
    if (this._keyConversionRequired === undefined) {
      this._keyConversionRequired = this.associationKeyType() !== this.ownerKeyType();
    }

    return this._keyConversionRequired;
  }

  /**
   * Mirrors: Preloader::Association#association_key_type
   * (`preloader/association.rb:282-284`).
   *
   * A composite key arrives here as an array of names, and Rails answers nil
   * for it rather than raising: `type_for_attribute` runs the name through
   * `resolve_attribute_name` → `name.to_s`
   * (`activemodel/attribute_registration.rb:44,101-103`), so the array
   * stringifies to a key no attribute has; `attribute_types` carries
   * `hash.default = Type.default_value` (`:37-41`), which is a bare
   * `Type::Value` whose `#type` is an empty method returning nil
   * (`activemodel/type/value.rb:34-35`). Both sides answer nil, compare equal,
   * and `key_conversion_required?` is false — which is what the guard below
   * reproduces. ActiveRecord does not override `type_for_attribute`.
   */
  private associationKeyType(): string | undefined {
    const associationKeyName = this.associationKeyName;
    if (Array.isArray(associationKeyName)) return undefined;
    return this.klass.typeForAttribute(associationKeyName).type();
  }

  /** Mirrors: Preloader::Association#owner_key_type
   *  (`preloader/association.rb:286-288`). Same composite-key answer as
   *  {@link Association.associationKeyType}; `model` is null for an ownerless
   *  loader, where Rails' `@model` would be nil and `type_for_attribute`
   *  unreachable. */
  private ownerKeyType(): string | undefined {
    const ownerKeyName = this.ownerKeyName;
    if (this.model == null || Array.isArray(ownerKeyName)) return undefined;
    return this.model.typeForAttribute(ownerKeyName).type();
  }

  /**
   * Mirrors: ActiveRecord::Associations::Preloader::Association#reflection_scope
   * (`preloader/association.rb:290-292`). Branch only passes a scope down for an
   * instance-dependent reflection scope; every other reflection recomputes it
   * lazily here, off the record.
   * @internal
   */
  protected get reflectionScope(): any {
    this._reflectionScope ??= (this.reflection as any)
      .joinScopes((this.klass as any).arelTable, (this.klass as any).predicateBuilder, this.klass)
      .reduce((acc: any, s: any) => acc.merge(s), (this.klass as any).unscoped());
    return this._reflectionScope;
  }

  private buildScope(): any {
    // Mirror Rails' build_scope `scope = klass.scope_for_association`. It bases
    // on the pristine relation (ignoring any enclosing current_scope) and
    // applies the target model's default_scope unless current_scope is itself
    // an empty scope.
    let scope = (this.klass as any).scopeForAssociation();

    const type = (this.reflection as any).type;
    if (type && !(this.reflection as any).isThroughReflection?.()) {
      scope = scope.where({
        [type]: (this.model as any)?.polymorphicName?.() ?? this.model?.name,
      });
    }

    if (!this.reflectionScope.isEmptyScope) {
      scope = scope.merge(this.reflectionScope);
    }

    if (this.preloadScope && !this.preloadScope.isEmptyScope) {
      scope = scope.merge(this.preloadScope);
    }

    return this.cascadeStrictLoading(scope);
  }

  /**
   * Propagate strict loading from the preload scope onto a derived scope.
   *
   * Mirrors: ActiveRecord::Associations::Preloader::Association#cascade_strict_loading
   * @internal
   */
  protected cascadeStrictLoading(scope: any): any {
    return this.preloadScope?.strictLoadingValue ? (scope.strictLoading?.() ?? scope) : scope;
  }

  private _uniqueOwners(owners: Base[]): Base[] {
    const seen = new Set<Base>();
    return owners.filter((o) => {
      if (seen.has(o)) return false;
      seen.add(o);
      return true;
    });
  }
}

/**
 * Wraps a scope and association key name for batch loading.
 * Loaders with equivalent LoaderQuery can be batched together.
 *
 * Mirrors: ActiveRecord::Associations::Preloader::Association::LoaderQuery
 */
export class LoaderQuery {
  readonly scope: any;
  readonly associationKeyName: string | string[];

  constructor(scope: any, associationKeyName: string | string[]) {
    this.scope = scope;
    this.associationKeyName = associationKeyName;
  }

  eql(other: LoaderQuery): boolean {
    const keysMatch =
      this.associationKeyName === other.associationKeyName ||
      (Array.isArray(this.associationKeyName) &&
        Array.isArray(other.associationKeyName) &&
        this.associationKeyName.length === other.associationKeyName.length &&
        this.associationKeyName.every((k, i) => k === (other.associationKeyName as string[])[i]));
    return (
      keysMatch &&
      this._scopeAdapterId() === other._scopeAdapterId() &&
      this._scopeTableName() === other._scopeTableName() &&
      this._valuesForQueries() === other._valuesForQueries()
    );
  }

  hashKey(): string {
    const keyName = Array.isArray(this.associationKeyName)
      ? this.associationKeyName.join(",")
      : this.associationKeyName;
    return `${keyName}::${this._scopeAdapterId()}::${this._scopeTableName()}::${this._valuesForQueries()}`;
  }

  private _scopeTableName(): string {
    return this.scope?._model?.tableName ?? this.scope?.tableName ?? "";
  }

  // Mirrors Rails' `scope.model.connection_specification_name` in
  // Preloader::Association::LoaderQuery#hash/#eql?. The adapter getter may
  // check out a connection on first call, but in practice the preloader runs
  // after records are loaded so the adapter is already cached on the class.
  private _scopeAdapterId(): string {
    const klass = this.scope?._model;
    if (klass == null) return "";
    const spec = klass.connectionSpecificationName ?? "";
    let adapter: object;
    try {
      adapter = klass.connection;
    } catch (e) {
      if (e instanceof ConnectionNotDefined) return spec;
      throw e;
    }
    let id = LoaderQuery._adapterIds.get(adapter);
    if (id == null) {
      id = ++LoaderQuery._idCounter;
      LoaderQuery._adapterIds.set(adapter, id);
    }
    return `${spec}:${id}`;
  }

  private static _adapterIds = new WeakMap<object, number>();
  private static _idCounter = 0;

  private _valuesForQueries(): string {
    return JSON.stringify(this.scope.valuesForQueries());
  }

  async loadRecordsForKeys(
    keys: unknown[],
    instantiateBlock?: (record: Base) => void,
  ): Promise<Base[]> {
    if (keys.length === 0) return [];

    if (Array.isArray(this.associationKeyName)) {
      const conditions: Record<string, Set<unknown>> = {};
      for (const values of keys) {
        // Composite keys arrive JSON-stringified because JS Map lacks the
        // structural array equality Ruby Hash uses in Rails' equivalent
        // (Preloader::Association#derive_key returns the raw array there).
        const valArr = (typeof values === "string" ? JSON.parse(values) : values) as unknown[];
        for (let i = 0; i < this.associationKeyName.length; i++) {
          const keyName = this.associationKeyName[i];
          if (!conditions[keyName]) conditions[keyName] = new Set();
          conditions[keyName].add(valArr[i]);
        }
      }
      const whereObj: Record<string, unknown[]> = {};
      for (const [k, v] of Object.entries(conditions)) {
        whereObj[k] = [...v];
      }
      const rel = this.scope.where(whereObj);
      if (instantiateBlock) rel._instantiateBlock = instantiateBlock;
      return rel.toArray();
    }

    const rel = this.scope.where({ [this.associationKeyName]: keys });
    if (instantiateBlock) rel._instantiateBlock = instantiateBlock;
    return rel.toArray();
  }

  recordsFor(loaders: Association[]): Promise<Base[]> {
    return new LoaderRecords(loaders, this).records();
  }

  async loadRecordsInBatch(loaders: Association[]): Promise<void> {
    const rawRecords = await this.recordsFor(loaders);

    for (const loader of loaders) {
      await loader.loadRecords(rawRecords);
    }
  }
}

/**
 * Manages loading records while checking for already-loaded ones.
 *
 * Mirrors: ActiveRecord::Associations::Preloader::Association::LoaderRecords
 */
export class LoaderRecords {
  /** @internal */
  readonly loaders: Association[];
  readonly loaderQuery: LoaderQuery;

  constructor(loaders: Association[], loaderQuery: LoaderQuery) {
    this.loaders = loaders;
    this.loaderQuery = loaderQuery;
  }

  async records(): Promise<Base[]> {
    const keysToLoad = new Set<unknown>();
    const alreadyLoadedByKey = new Map<unknown, Base[]>();

    for (const loader of this.loaders) {
      for (const [key, owners] of loader.ownersByKey) {
        const loadedOwner = owners.find((owner) => loader.isLoaded(owner));
        if (loadedOwner) {
          alreadyLoadedByKey.set(key, loader.targetFor(loadedOwner));
        } else {
          keysToLoad.add(key);
        }
      }
    }

    for (const key of alreadyLoadedByKey.keys()) {
      keysToLoad.delete(key);
    }

    const loaded = await this.loaderQuery.loadRecordsForKeys([...keysToLoad], (record) => {
      for (const loader of this.loaders) {
        loader.setInverse(record);
      }
    });

    return [...loaded, ...Array.from(alreadyLoadedByKey.values()).flat()];
  }
}
