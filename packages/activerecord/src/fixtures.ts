import { insertFixturesSet } from "./connection-adapters/abstract/database-statements.js";
import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";
import { Base } from "./base.js";
import { StatementInvalid } from "./errors.js";
import {
  camelize,
  isPresent,
  OID_NAMESPACE,
  runLoadHooks,
  singularize,
  uuidV5,
} from "@blazetrails/activesupport";
import { Zlib, prepend } from "@blazetrails/ruby-compat";
import { EncryptedFixtures } from "./encryption/encrypted-fixtures.js";
import { Configurable } from "./encryption/configurable.js";
import { _setFixtureError } from "./fixture-error-slot.js";
import { TableRows } from "./fixture-set/table-rows.js";

const REF_TAG = Symbol("fixture-ref");

export interface FixtureRef {
  readonly [REF_TAG]: true;
  readonly tableName: string;
  readonly fixtureName: string;
}

export function ref(tableName: string, fixtureName: string): FixtureRef {
  return { [REF_TAG]: true, tableName, fixtureName };
}

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export function isFixtureRef(v: unknown): v is FixtureRef {
  return typeof v === "object" && v !== null && REF_TAG in v;
}

const tableRegistries = new WeakMap<object, Map<string, BaseClass>>();

function getRegistry(adapter: object): Map<string, BaseClass> {
  let reg = tableRegistries.get(adapter);
  if (!reg) {
    reg = new Map();
    tableRegistries.set(adapter, reg);
  }
  return reg;
}

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE FixtureSet#model_class (fixtures.rb:754) reached by table name because our registry is keyed that way.
 */
export function resolveModelForTable(
  adapter: DatabaseAdapter,
  tableName: string,
): BaseClass | undefined {
  return getRegistry(adapter).get(tableName);
}

/** @noRailsEquivalent CONVERGEABLE converge-receipted-activerecord-root-and-adapter-names */
export function throughJoinTableNames(ModelClass: BaseClass): string[] {
  const reflections: Record<string, unknown> = (ModelClass as any)._reflections ?? {};
  const names: string[] = [];
  for (const refl of Object.values(reflections)) {
    const r = refl as {
      parentReflection?: { macro?: string } | null;
      throughReflection?: { tableName?: string };
    };
    if (r.parentReflection?.macro !== "hasAndBelongsToMany") continue;
    try {
      const joinTable = r.throughReflection?.tableName;
      if (typeof joinTable === "string") names.push(joinTable);
    } catch {
      continue;
    }
  }
  return names;
}

interface PolymorphicBelongsTo {
  typeColumn: string;
  idColumn: string;
}

function findPolymorphicRef(modelClass: BaseClass, colName: string): PolymorphicBelongsTo | null {
  const reflections: Record<string, unknown> = (modelClass as any)._reflections ?? {};
  const refl = reflections[colName] as
    | {
        macro?: string;
        isPolymorphic?: () => boolean;
        foreignType?: string;
        foreignKey?: string | string[];
      }
    | undefined;
  if (!refl || refl.macro !== "belongsTo" || !refl.isPolymorphic?.()) return null;
  const typeColumn: string = refl.foreignType ?? `${colName}_type`;
  const rawFk: string | string[] = refl.foreignKey ?? `${colName}_id`;
  if (Array.isArray(rawFk)) {
    throw new Error(
      `defineFixtures: polymorphic association "${colName}" has a composite foreignKey — pass explicit ${typeColumn}, ${rawFk.join(", ")} instead`,
    );
  }
  return { typeColumn, idColumn: rawFk };
}

type BaseClass = typeof Base;
type FixtureAttrs = Record<string, unknown>;

/** @internal */
export interface PreparedFixtureSet {
  tables: Record<string, FixtureAttrs[]>;
  serialReset: { table: string; column: string } | null;
  rollback: () => void;
  finalize: () => Promise<Record<string, unknown>>;
}

async function resetPkSequence(
  adapter: DatabaseAdapter,
  tableName: string,
  serialResetCol: string,
): Promise<void> {
  const sequence = (await adapter.queryValue(
    `SELECT pg_get_serial_sequence($1, $2) AS seq`,
    "SQL",
    [tableName, serialResetCol],
  )) as string | null | undefined;
  if (!sequence) return;
  const qt = adapter.quoteTableName(tableName);
  const qc = adapter.quoteColumnName(serialResetCol);
  await adapter.executeMutation(
    `SELECT setval($1, GREATEST(COALESCE(MAX(${qc}), 0), 1), COALESCE(MAX(${qc}), 0) <> 0) FROM ${qt}`,
    [sequence],
  );
}

/**
 * Inserts a whole load's worth of prepared fixture sets through a SINGLE
 * `insertFixturesSet` call, mirroring Rails' `fixtures.rb` `insert`: it merges
 * every set's `table_rows` into one `table_rows_for_connection` hash and calls
 * `conn.insert_fixtures_set(table_rows_for_connection, keys)` exactly once per
 * pool per load. That one call owns the sole `disable_referential_integrity`
 * block and the sole `transaction(requires_new: true)` — so referential
 * integrity is toggled once per load, not once per table (RFC 0060: the #4528
 * profile pinned 96% of PG DDL time on per-table RI toggling).
 *
 * Sets are prepared in declaration order (so a later set's `ref()` resolves ids
 * a prior set registered), then all rows land together with RI disabled, so
 * cross-table FK order among them does not matter. Returns each set's reloaded
 * result in the same order the sets were passed.
 * @internal
 * @noRailsEquivalent CONVERGEABLE the single insert_fixtures_set call of FixtureSet.insert (fixtures.rb:665), extracted so the merge happens once per load.
 */
export async function insertPreparedFixtureSets(
  adapter: DatabaseAdapter,
  prepared: PreparedFixtureSet[],
): Promise<Record<string, unknown>[]> {
  if (prepared.length === 0) return [];

  const merged: Record<string, FixtureAttrs[]> = {};
  for (const p of prepared) {
    for (const [table, rows] of Object.entries(p.tables)) {
      (merged[table] ??= []).unshift(...rows);
    }
  }

  try {
    await insertFixturesSet.call(
      adapter as unknown as ThisParameterType<typeof insertFixturesSet>,
      merged,
      Object.keys(merged),
    );
  } catch (err) {
    for (const p of prepared) p.rollback();
    throw err;
  }

  await checkAllForeignKeysValidBang(adapter);

  if ("resetPkSequenceBang" in adapter) {
    for (const p of prepared) {
      if (p.serialReset) await resetPkSequence(adapter, p.serialReset.table, p.serialReset.column);
    }
  }

  const results: Record<string, unknown>[] = [];
  for (const p of prepared) results.push(await p.finalize());
  return results;
}

async function checkAllForeignKeysValidBang(conn: DatabaseAdapter): Promise<void> {
  if (!Base.verifyForeignKeysForFixtures) return;

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

/** @noRailsEquivalent CONVERGEABLE converge-receipted-activerecord-root-and-adapter-names */
export async function defineFixtures<T extends BaseClass, K extends string>(
  adapter: DatabaseAdapter,
  ModelClass: T,
  fixtures: Record<K, FixtureAttrs>,
): Promise<{ [P in K]: InstanceType<T> }> {
  const prepared = await prepareModelFixtures(adapter, ModelClass, fixtures);
  const [result] = await insertPreparedFixtureSets(adapter, [prepared]);
  return result as { [P in K]: InstanceType<T> };
}

/** @noRailsEquivalent CONVERGEABLE converge-receipted-activerecord-root-and-adapter-names */
export async function prepareModelFixtures(
  adapter: DatabaseAdapter,
  ModelClass: BaseClass,
  fixtures: Record<string, FixtureAttrs>,
): Promise<PreparedFixtureSet> {
  const tableName = ModelClass.tableName;
  const declaredPk = ModelClass.primaryKey;

  let pkCol: string | string[] | null = declaredPk;
  let serialResetCol: string | null = null;
  if (typeof (adapter as any).primaryKey === "function") {
    const schemaPk: string | string[] | null = await (adapter as any).primaryKey(tableName);
    if (Array.isArray(declaredPk)) {
      pkCol = declaredPk;
      serialResetCol = typeof schemaPk === "string" ? schemaPk : null;
    } else if (schemaPk === null) {
      pkCol = null;
    } else if (Array.isArray(schemaPk)) {
      pkCol = schemaPk;
    } else if (declaredPk !== "id" && declaredPk !== schemaPk) {
      throw new Error(
        `defineFixtures: ${ModelClass.name} declares primaryKey "${declaredPk}" but table "${tableName}" has primary key "${schemaPk}" — fix the model or the schema`,
      );
    } else {
      pkCol = schemaPk;
      serialResetCol = schemaPk;
    }
  }

  const registry = getRegistry(adapter);
  registry.set(tableName, ModelClass);

  const base = (fixtures["_fixture"] as { ignore?: unknown } | undefined)?.ignore;
  const ignoredFixtures: string[] = Array.isArray(base)
    ? [...base]
    : typeof base === "string"
      ? [base]
      : [];
  if (!ignoredFixtures.includes("DEFAULTS")) ignoredFixtures.push("DEFAULTS");
  const labels = Object.keys(fixtures).filter(
    (label) => label !== "_fixture" && !ignoredFixtures.includes(label),
  );

  await ModelClass.loadSchema();

  const encryptFixtures =
    Configurable.config.encryptFixtures && isPresent(ModelClass.encryptedAttributes);
  const fkColToCompositeRef = new Map<string, { column: string; pkCols: string[] }>();
  {
    const reflections: Record<string, unknown> = (ModelClass as any)._reflections ?? {};
    for (const refl of Object.values(reflections) as {
      macro?: string;
      isPolymorphic?: () => boolean;
      foreignKey?: string | string[];
      joinPrimaryKey?: () => string | string[];
      klass?: { primaryKey?: unknown };
    }[]) {
      if (refl.macro !== "belongsTo" || refl.isPolymorphic?.()) continue;
      let targetPk: unknown;
      let jpk: string | string[] | undefined;
      let fk: string | string[] | undefined;
      try {
        targetPk = refl.klass?.primaryKey;
        jpk = refl.joinPrimaryKey?.();
        fk = refl.foreignKey;
      } catch {
        continue;
      }
      if (!Array.isArray(targetPk)) continue;
      const fkStr = Array.isArray(fk) ? (fk.length === 1 ? fk[0] : undefined) : fk;
      const jpkStr = Array.isArray(jpk) ? (jpk.length === 1 ? jpk[0] : undefined) : jpk;
      if (typeof fkStr === "string" && typeof jpkStr === "string") {
        fkColToCompositeRef.set(fkStr, { column: jpkStr, pkCols: targetPk as string[] });
      }
    }
  }

  const modelFixtures: Record<string, Fixture> = {};
  for (const label of labels) {
    const row: FixtureAttrs = {};
    for (const [col, val] of Object.entries(fixtures[label])) {
      const poly = findPolymorphicRef(ModelClass, col);

      if (isFixtureRef(val)) {
        if (poly) {
          throw new Error(
            `defineFixtures: "${col}" is a polymorphic association — pass a model instance instead of ref(). ` +
              `Use explicit ${poly.typeColumn}/${poly.idColumn} if you need to reference by ID.`,
          );
        }
        const compRef = fkColToCompositeRef.get(col);
        row[col] = compRef
          ? (FixtureSet.compositeIdentify(val.fixtureName, compRef.pkCols)[compRef.column] ??
            FixtureSet.identify(val.fixtureName))
          : FixtureSet.identify(val.fixtureName);
        continue;
      }

      if (poly && val instanceof Base) {
        const instanceClass = (val as any).constructor as BaseClass;
        const instancePk = instanceClass.primaryKey;
        if (Array.isArray(instancePk)) {
          throw new Error(
            `defineFixtures: polymorphic target "${col}" has a composite primary key — pass explicit ${poly.typeColumn} and ${poly.idColumn} instead`,
          );
        }
        row[poly.idColumn] = (val as unknown as FixtureAttrs)[instancePk];
        row[poly.typeColumn] = (instanceClass as any).polymorphicName?.() ?? instanceClass.name;
        continue;
      }

      row[col] = val;
    }
    modelFixtures[label] = new Fixture(row, encryptFixtures ? ModelClass : null);
  }

  const tables = new TableRows(tableName, {
    modelClass: ModelClass,
    fixtures: modelFixtures,
  }).toHash();
  const rows = tables[tableName];

  const virtualNames = ModelClass.columns()
    .filter((c: { isVirtual(): boolean }) => c.isVirtual())
    .map((c: { name: string }) => c.name);
  for (const row of rows) {
    for (const name of virtualNames) delete row[name];
  }

  const finalize = async (): Promise<Record<string, unknown>> => {
    const result: Record<string, unknown> = {};
    for (let i = 0; i < labels.length; i++) {
      const label = labels[i];
      const row = rows[i];
      let criteria: FixtureAttrs;
      if (pkCol === null) {
        criteria = row;
      } else if (typeof pkCol === "string") {
        criteria = { [pkCol]: row[pkCol] };
      } else {
        criteria = {};
        for (const keyCol of pkCol) criteria[keyCol] = row[keyCol];
      }
      const find = () => (ModelClass as any).findBy(criteria);
      const record =
        typeof (ModelClass as any).unscoped === "function"
          ? await (ModelClass as any).unscoped(find)
          : await find();
      if (!record) {
        throw new Error(
          `defineFixtures: inserted fixture "${label}" not found after insert (table: ${tableName}, criteria: ${JSON.stringify(criteria)})`,
        );
      }
      result[label] = record;
    }
    return result;
  };

  const serialReset = serialResetCol !== null ? { table: tableName, column: serialResetCol } : null;

  return { tables, serialReset, rollback: () => {}, finalize };
}

/** @noRailsEquivalent CONVERGEABLE converge-receipted-activerecord-root-and-adapter-names */
export async function defineJoinTableFixtures(
  adapter: DatabaseAdapter,
  tableName: string,
  fixtures: Record<string, FixtureAttrs>,
): Promise<Record<string, FixtureAttrs>> {
  const prepared = await prepareJoinTableFixtures(adapter, tableName, fixtures);
  const [result] = await insertPreparedFixtureSets(adapter, [prepared]);
  return result as Record<string, FixtureAttrs>;
}

/** @noRailsEquivalent CONVERGEABLE converge-receipted-activerecord-root-and-adapter-names */
export async function prepareJoinTableFixtures(
  adapter: DatabaseAdapter,
  tableName: string,
  fixtures: Record<string, FixtureAttrs>,
): Promise<PreparedFixtureSet> {
  let columnNames: Set<string> | null = null;
  if (typeof (adapter as any).columns === "function") {
    const cols: { name: string }[] = await (adapter as any).columns(tableName);
    columnNames = new Set(cols.map((c) => c.name));
  }

  const rows: FixtureAttrs[] = [];
  const resolved: Record<string, FixtureAttrs> = {};
  for (const [label, attrs] of Object.entries(fixtures)) {
    const row: FixtureAttrs = {};
    if (columnNames) {
      const unknown = Object.keys(attrs).filter((col) => !columnNames.has(col));
      if (unknown.length > 0) {
        throw new Error(
          `table "${tableName}" has no columns named ${unknown.map((c) => `"${c}"`).join(", ")}.`,
        );
      }
    }
    for (const [col, val] of Object.entries(attrs)) {
      row[col] = isFixtureRef(val) ? FixtureSet.identify(val.fixtureName) : val;
    }
    rows.push(row);
    resolved[label] = row;
  }

  return {
    tables: { [tableName]: rows },
    serialReset: null,
    rollback: () => {},
    finalize: async () => resolved,
  };
}

const contextClasses = new WeakMap<object, new () => object>();

export class FixtureSet {
  static readonly MAX_ID = 2 ** 30 - 1;

  static defaultFixtureModelName(fixtureSetName: string, config: typeof Base = Base): string {
    return config.pluralizeTableNames
      ? camelize(singularize(fixtureSetName))
      : camelize(fixtureSetName);
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

  static async createFixtures<T extends BaseClass, K extends string>(
    adapter: DatabaseAdapter,
    ModelClass: T,
    fixtures: Record<K, FixtureAttrs>,
  ): Promise<{ [P in K]: InstanceType<T> }> {
    return defineFixtures(adapter, ModelClass, fixtures);
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

  toHash(): FixtureAttrs {
    return this.fixture;
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
