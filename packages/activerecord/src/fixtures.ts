import { insertFixturesSet } from "./connection-adapters/abstract/database-statements.js";
import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";
import { Base } from "./base.js";
import { ActiveRecordError, StatementInvalid } from "./errors.js";
import type { ConnectionPool } from "./connection-adapters/abstract/connection-pool.js";
import {
  camelize,
  OID_NAMESPACE,
  runLoadHooks,
  safeConstantize,
  singularize,
  uuidV5,
} from "@blazetrails/activesupport";
import {
  ArgumentError,
  Dir,
  File as RubyFile,
  Zlib,
  prepend,
  rbObjRespondTo,
} from "@blazetrails/ruby-compat";
import { EncryptedFixtures } from "./encryption/encrypted-fixtures.js";
import { _setFixtureError } from "./fixture-error-slot.js";
import { TableRows } from "./fixture-set/table-rows.js";
import { File } from "./fixture-set/file.js";
import { verifyForeignKeysForFixtures } from "./active-record.js";

export class FixtureClassNotFound extends ActiveRecordError {
  constructor(message?: string) {
    super(message);
    this.name = "ActiveRecord::FixtureClassNotFound";
  }
}

type BaseClass = typeof Base;
type FixtureAttrs = Record<string, unknown>;

/** @internal */
export async function checkAllForeignKeysValidBang(conn: DatabaseAdapter): Promise<void> {
  if (!verifyForeignKeysForFixtures()) return;

  try {
    await conn.checkAllForeignKeysValidBang();
  } catch (e) {
    if (!(e instanceof StatementInvalid)) throw e;
    throw new Error(
      `Foreign key violations found in your fixture data. Ensure you aren't referring to labels that don't exist on associations. Error from database:\n\n${e.message}`,
      { cause: e },
    );
  }
}

const contextClasses = new WeakMap<object, new () => object>();

const allCachedFixtures = new Map<ConnectionPool, Record<string, FixtureSet>>();

export class FixtureSet {
  static readonly MAX_ID = 2 ** 30 - 1;

  static allLoadedFixtures: Record<string, FixtureSet> = {};

  static defaultFixtureModelName(fixtureSetName: string, config: typeof Base = Base): string {
    return config.pluralizeTableNames
      ? camelize(singularize(fixtureSetName))
      : camelize(fixtureSetName);
  }

  static defaultFixtureTableName(fixtureSetName: string, config: typeof Base = Base): string {
    return `${config.tableNamePrefix}${fixtureSetName.replaceAll("/", "_")}${config.tableNameSuffix}`;
  }

  static resetCache(): void {
    allCachedFixtures.clear();
  }

  static cacheForConnectionPool(connectionPool: ConnectionPool): Record<string, FixtureSet> {
    let cache = allCachedFixtures.get(connectionPool);
    if (cache === undefined) allCachedFixtures.set(connectionPool, (cache = {}));
    return cache;
  }

  static isFixtureIsCached(
    connectionPool: ConnectionPool,
    tableName: string,
  ): FixtureSet | undefined {
    return this.cacheForConnectionPool(connectionPool)[tableName];
  }

  static cachedFixtures(
    connectionPool: ConnectionPool,
    keysToFetch: readonly string[] | null = null,
  ): FixtureSet[] {
    if (keysToFetch) {
      return keysToFetch.map((key) => this.cacheForConnectionPool(connectionPool)[key]);
    } else {
      return Object.values(this.cacheForConnectionPool(connectionPool));
    }
  }

  static cacheFixtures(
    connectionPool: ConnectionPool,
    fixturesMap: Record<string, FixtureSet>,
  ): void {
    Object.assign(this.cacheForConnectionPool(connectionPool), fixturesMap);
  }

  static async instantiateFixtures(
    object: object,
    fixtureSet: FixtureSet,
    loadInstances = true,
  ): Promise<void> {
    if (!loadInstances) return;
    let instances = Promise.resolve();
    fixtureSet.each((fixtureName, fixture) => {
      instances = instances.then(async () => {
        try {
          Object.defineProperty(object, `_${fixtureName}`, {
            value: await fixture.find(),
            writable: true,
            enumerable: true,
            configurable: true,
          });
        } catch (error) {
          if (!(error instanceof FixtureClassNotFound)) throw error;
        }
      });
    });
    await instances;
  }

  static async instantiateAllLoadedFixtures(object: object, loadInstances = true): Promise<void> {
    for (const fixtureSet of Object.values(this.allLoadedFixtures)) {
      await this.instantiateFixtures(object, fixtureSet, loadInstances);
    }
  }

  static identify(label: string): number;
  static identify(label: string, columnType: string): number | string;
  static identify(label: string, columnType: string = ":integer"): number | string {
    if (columnType === ":uuid") {
      return uuidV5(OID_NAMESPACE, String(label));
    } else {
      return Zlib.crc32(String(label)) % FixtureSet.MAX_ID;
    }
  }

  static compositeIdentify(label: string, key: readonly string[]): Record<string, number> {
    const out: Record<string, number> = {};
    key.forEach((subKey, index) => {
      out[subKey] = Number(
        (BigInt(FixtureSet.identify(label)) << BigInt(index)) % BigInt(FixtureSet.MAX_ID),
      );
    });
    return out;
  }

  static get contextClass(): new () => object {
    let contextClass = contextClasses.get(this);
    if (contextClass === undefined) {
      contextClass = class {};
      contextClasses.set(this, contextClass);
    }
    return contextClass;
  }

  static async createFixtures(
    fixturesDirectories: string | readonly string[],
    fixtureSetNames: string | readonly string[],
    classNames: Record<string, BaseClass | string | null> = {},
    config: typeof Base = Base,
  ): Promise<FixtureSet[]> {
    const names = (typeof fixtureSetNames === "string" ? [fixtureSetNames] : fixtureSetNames).map(
      String,
    );

    const connectionPool = config.connectionPool();
    const fixtureFilesToRead = names.filter(
      (fsName) => !this.isFixtureIsCached(connectionPool, fsName),
    );

    if (fixtureFilesToRead.length > 0) {
      const fixturesMap = await this.readAndInsert(
        typeof fixturesDirectories === "string" ? [fixturesDirectories] : fixturesDirectories,
        fixtureFilesToRead,
        classNames,
        connectionPool,
      );
      this.cacheFixtures(connectionPool, fixturesMap);
    }
    return this.cachedFixtures(connectionPool, names);
  }

  private static async readAndInsert(
    fixturesDirectories: readonly string[],
    fixtureFiles: string[],
    classNames: Record<string, BaseClass | string | null>,
    connectionPool: ConnectionPool,
  ): Promise<Record<string, FixtureSet>> {
    const fixturesMap: Record<string, FixtureSet> = {};
    const directoryGlob = `{${fixturesDirectories.join(",")}}`;
    const fixtureSets = fixtureFiles.map((fixtureSetName) => {
      const klass = classNames[fixtureSetName] ?? null;
      return (fixturesMap[fixtureSetName] = new this(
        null,
        fixtureSetName,
        klass,
        RubyFile.join(directoryGlob, fixtureSetName),
      ));
    });
    this.updateAllLoadedFixtures(fixturesMap);

    await this.insert(fixtureSets, connectionPool);

    return fixturesMap;
  }

  private static async insert(
    fixtureSets: FixtureSet[],
    connectionPool: ConnectionPool,
  ): Promise<void> {
    const fixtureSetsByPool = new Map<ConnectionPool, FixtureSet[]>();
    for (const fixtureSet of fixtureSets) {
      const pool = fixtureSet.modelClass ? fixtureSet.modelClass.connectionPool() : connectionPool;
      const group = fixtureSetsByPool.get(pool) ?? [];
      group.push(fixtureSet);
      fixtureSetsByPool.set(pool, group);
    }

    for (const [pool, set] of fixtureSetsByPool) {
      const tableRowsForConnection: Record<string, FixtureAttrs[]> = {};

      for (const fixtureSet of set) {
        await fixtureSet.modelClass?.loadSchema();
        for (const [table, rows] of Object.entries(fixtureSet.tableRows())) {
          (tableRowsForConnection[table] ??= []).unshift(...rows);
        }
      }

      await pool.withConnection(async (conn) => {
        await insertFixturesSet.call(
          conn as unknown as ThisParameterType<typeof insertFixturesSet>,
          tableRowsForConnection,
          Object.keys(tableRowsForConnection),
        );

        await checkAllForeignKeysValidBang(conn);

        if (rbObjRespondTo(conn, "resetPkSequenceBang")) {
          for (const fs of set)
            await (
              conn as unknown as { resetPkSequenceBang(table: string): Promise<void> }
            ).resetPkSequenceBang(fs.tableName);
        }
      });
    }
  }

  private static updateAllLoadedFixtures(fixturesMap: Record<string, FixtureSet>): void {
    Object.assign(this.allLoadedFixtures, fixturesMap);
  }

  readonly tableName: string;
  readonly name: string;
  readonly fixtures: Record<string, Fixture>;
  readonly config: typeof Base;
  private _modelClass: BaseClass | null = null;
  private _ignoredFixtures: string[] | null = null;
  private _path: string;

  constructor(
    _: unknown,
    name: string,
    className: BaseClass | string | null,
    path: string,
    config: typeof Base = Base,
  ) {
    this.name = name;
    this._path = path;
    this.config = config;

    this.setModelClass(className);
    this.fixtures = this.readFixtureFiles(path);

    this.tableName =
      this.modelClass?.tableName ??
      (this.constructor as typeof FixtureSet).defaultFixtureTableName(name, config);
  }

  get modelClass(): BaseClass | null {
    return this._modelClass;
  }

  get ignoredFixtures(): string[] | null {
    return this._ignoredFixtures;
  }

  get(x: string): Fixture | undefined {
    return this.fixtures[x];
  }

  set(k: string, v: Fixture): Fixture {
    return (this.fixtures[k] = v);
  }

  each(block: (fixtureName: string, fixture: Fixture) => void): Record<string, Fixture> {
    for (const [fixtureName, fixture] of Object.entries(this.fixtures)) block(fixtureName, fixture);
    return this.fixtures;
  }

  size(): number {
    return Object.keys(this.fixtures).length;
  }

  tableRows(): Record<string, Record<string, unknown>[]> {
    for (const label of this.ignoredFixtures ?? []) delete this.fixtures[label];

    return new TableRows(this.tableName, {
      modelClass: this.modelClass,
      fixtures: this.fixtures,
    }).toHash();
  }

  private setModelClass(className: BaseClass | string | null): void {
    if (className != null && typeof className !== "string") {
      this._modelClass = className;
    } else {
      this._modelClass = className
        ? ((safeConstantize(className) as BaseClass | undefined) ?? null)
        : null;
    }
  }

  private setIgnoredFixtures(base: unknown): void {
    this._ignoredFixtures = Array.isArray(base)
      ? (base as string[])
      : typeof base === "string"
        ? [base]
        : [];

    if (!this._ignoredFixtures.includes("DEFAULTS")) this._ignoredFixtures.push("DEFAULTS");
  }

  private readFixtureFiles(path: string): Record<string, Fixture> {
    const yamlFiles = [
      ...Dir.glob(`${path}{.yml,/{**,*}/*.yml}`).filter((f) => RubyFile.isFile(f)),
      ...File.modules().filter((f) =>
        RubyFile.fnmatch(
          `${path}{.ts,/{**,*}/*.ts}`,
          f,
          RubyFile.FNM_EXTGLOB | RubyFile.FNM_PATHNAME,
        ),
      ),
    ];

    if (yamlFiles.length === 0) throw new ArgumentError(`No fixture files found for ${this.name}`);

    return yamlFiles.reduce<Record<string, Fixture>>((fixtures, file) => {
      File.open(file, (fh) => {
        if (this.modelClass == null && fh.modelClass) this.setModelClass(fh.modelClass as string);
        if (this.modelClass == null) this.setModelClass(this.defaultFixtureModelClass());
        if (this.ignoredFixtures == null) this.setIgnoredFixtures(fh.ignoredFixtures);
        fh.each(([fixtureName, row]) => {
          fixtures[fixtureName] = new Fixture(row as FixtureAttrs, this.modelClass);
        });
      });
      return fixtures;
    }, {});
  }

  private defaultFixtureModelClass(): BaseClass | null {
    const klass = safeConstantize(FixtureSet.defaultFixtureModelName(this.name, this.config)) as
      | BaseClass
      | undefined;
    return klass && klass.prototype instanceof Base ? klass : null;
  }
}

export class Fixture {
  modelClass!: BaseClass | null;
  fixture!: FixtureAttrs;

  constructor(fixture: FixtureAttrs, modelClass: BaseClass | null) {
    this.initialize(fixture, modelClass);
  }

  initialize(fixture: FixtureAttrs, modelClass: BaseClass | null): void {
    this.fixture = fixture;
    this.modelClass = modelClass;
  }

  get className(): string | undefined {
    return this.modelClass ? this.modelClass.name : undefined;
  }

  each(block: (key: string, value: unknown) => void): FixtureAttrs {
    for (const [key, value] of Object.entries(this.fixture)) block(key, value);
    return this.fixture;
  }

  get(key: string): unknown {
    return key in this.fixture ? this.fixture[key] : null;
  }

  toHash(): FixtureAttrs {
    return this.fixture;
  }

  async find(): Promise<Base> {
    if (!this.modelClass) throw new FixtureClassNotFound("No class attached to find.");
    const modelClass = this.modelClass;
    const object = await modelClass.unscoped(() => {
      const pk = modelClass.primaryKey;
      const pkClauses: FixtureAttrs = {};
      for (const key of Array.isArray(pk) ? pk : pk == null ? [] : [pk]) {
        if (key in this.fixture) pkClauses[key] = this.fixture[key];
      }
      return modelClass.findByBang(pkClauses);
    });
    object._strictLoading = false;
    return object;
  }
}

export class FixtureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActiveRecord::Fixture::FixtureError";
  }
}

export class FormatError extends FixtureError {
  constructor(message: string) {
    super(message);
    this.name = "ActiveRecord::Fixture::FormatError";
  }
}

_setFixtureError(FixtureError);

prepend(Fixture.prototype, EncryptedFixtures);

runLoadHooks("active_record_fixture_set", FixtureSet);
