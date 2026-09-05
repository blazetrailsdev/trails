import { wrap } from "@blazetrails/activesupport";
import type { Base } from "../../base.js";
import type { AssociationReflection, ThroughReflection } from "../../reflection.js";
import { ConnectionNotDefined } from "../../errors.js";
import { _wireInverseAssociation } from "../../associations.js";

type AssociationLikeReflection = AssociationReflection | ThroughReflection;

const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_SAFE_BIGINT = BigInt(Number.MIN_SAFE_INTEGER);

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
    this._associate = associateByDefault || preloadScope == null || preloadScope.isEmptyScope;
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

  async preloadedRecords(): Promise<Base[]> {
    if (this._preloadedRecords === undefined) {
      await this.loadRecords();
    }
    return this._preloadedRecords!;
  }

  get associationKeyName(): string | string[] {
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
          if (i === 0) {
            association.setInverseInstance(record);
          }
        } catch {}
      }
    }
  }

  private get model(): typeof Base | null {
    return this._model;
  }

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

    let inverseName: string | undefined;
    try {
      inverseName =
        (this.reflection as any).inverseName?.() ?? (this.reflection as any).options?.inverseOf;
    } catch {
      inverseName = (this.reflection as any).options?.inverseOf;
    }
    if (inverseName) {
      for (const child of records) {
        _wireInverseAssociation(owner, child, inverseName);
      }
    }
  }

  private deriveKey(owner: Base, key: string | string[]): unknown {
    if (Array.isArray(key)) {
      return JSON.stringify(key.map((k) => this.convertKey((owner as any)._readAttribute(k))));
    }
    return this.convertKey((owner as any)._readAttribute(key));
  }

  private convertKey(key: unknown): unknown {
    if (key == null) return key;
    if (this.isKeyConversionRequired()) return String(key);
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

  private associationKeyType(): string | undefined {
    const associationKeyName = this.associationKeyName;
    if (Array.isArray(associationKeyName)) return undefined;
    return this.klass.typeForAttribute(associationKeyName)!.type();
  }

  private ownerKeyType(): string | undefined {
    const ownerKeyName = this.ownerKeyName;
    if (this.model == null || Array.isArray(ownerKeyName)) return undefined;
    return this.model.typeForAttribute(ownerKeyName)!.type();
  }

  /** @internal */
  protected get reflectionScope(): any {
    this._reflectionScope ??= (this.reflection as any)
      .joinScopes((this.klass as any).arelTable, (this.klass as any).predicateBuilder, this.klass)
      .reduce((acc: any, s: any) => acc.merge(s), (this.klass as any).unscoped());
    return this._reflectionScope;
  }

  private buildScope(): any {
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

  /** @internal */
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

  hash(): string {
    const keyName = Array.isArray(this.associationKeyName)
      ? this.associationKeyName.join(",")
      : this.associationKeyName;
    return `${keyName}::${this._scopeAdapterId()}::${this._scopeTableName()}::${this._valuesForQueries()}`;
  }

  private _scopeTableName(): string {
    return this.scope?._model?.tableName ?? this.scope?.tableName ?? "";
  }

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

export class LoaderRecords {
  /** @internal */
  readonly loaderQuery: LoaderQuery;
  /** @internal */
  readonly loaders: Association[];
  /** @internal */
  readonly keysToLoad: Set<unknown>;
  /** @internal */
  readonly alreadyLoadedRecordsByKey: Map<unknown, Base[]>;

  constructor(loaders: Association[], loaderQuery: LoaderQuery) {
    this.loaderQuery = loaderQuery;
    this.loaders = loaders;
    this.keysToLoad = new Set();
    this.alreadyLoadedRecordsByKey = new Map();

    this.populateKeysToLoadAndAlreadyLoadedRecords();
  }

  async records(): Promise<Base[]> {
    return [...(await this.loadRecords()), ...this.alreadyLoadedRecords()];
  }

  /** @internal */
  populateKeysToLoadAndAlreadyLoadedRecords(): void {
    for (const loader of this.loaders) {
      for (const [key, owners] of loader.ownersByKey) {
        const loadedOwner = owners.find((owner) => loader.isLoaded(owner));
        if (loadedOwner) {
          this.alreadyLoadedRecordsByKey.set(key, loader.targetFor(loadedOwner));
        } else {
          this.keysToLoad.add(key);
        }
      }
    }

    for (const key of this.alreadyLoadedRecordsByKey.keys()) {
      this.keysToLoad.delete(key);
    }
  }

  /** @internal */
  loadRecords(): Promise<Base[]> {
    return this.loaderQuery.loadRecordsForKeys([...this.keysToLoad], (record) => {
      for (const l of this.loaders) l.setInverse(record);
    });
  }

  /** @internal */
  alreadyLoadedRecords(): Base[] {
    return [...this.alreadyLoadedRecordsByKey.values()].flat();
  }
}
