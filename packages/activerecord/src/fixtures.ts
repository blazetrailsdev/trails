import {
  insertFixturesSet,
  type DatabaseStatementsHost,
} from "./connection-adapters/abstract/database-statements.js";
import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";
import { Base } from "./base.js";
import { ActiveRecord } from "./ar-config.js";
import { StatementInvalid } from "./errors.js";
import { findStiClass } from "./inheritance.js";
import type { Quoting } from "./connection-adapters/abstract/quoting.js";
import { currentTimeFromProperTimezone } from "./timestamp.js";
import { isPresent, singularize, underscore } from "@blazetrails/activesupport";
import { EncryptedAttributeType } from "./encryption/encrypted-attribute-type.js";
import { EncryptableRecord } from "./encryption/encryptable-record.js";
import { Configurable } from "./encryption/configurable.js";
import { defaultValue, type Type } from "@blazetrails/activemodel";

/** @internal */
export class FixtureSetPrimaryKeyError extends Error {
  constructor(
    label: string,
    associationName: string,
    value: unknown,
    joinPrimaryKey: string,
    klassPrimaryKey: string,
    foreignKey: string,
    klassName: string,
  ) {
    super(
      `Unable to set ${associationName} to ${String(value)} because the association has a\n` +
        `custom primary key (${joinPrimaryKey}) that does not match the\n` +
        `associated table's primary key (${klassPrimaryKey}).\n\n` +
        `To fix this, change your fixture from\n\n` +
        `${label}:\n  ${associationName}: ${String(value)}\n\n` +
        `to\n\n` +
        `${label}:\n  ${foreignKey}: **value**\n\n` +
        `where **value** is the ${joinPrimaryKey} value for the\n` +
        `associated ${klassName} record.`,
    );
    this.name = "FixtureSetPrimaryKeyError";
  }
}

const FIXTURE_MAX_ID = 2 ** 30 - 1;

const TIMESTAMP_COLUMN_NAMES = ["created_at", "created_on", "updated_at", "updated_on"];

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  return table;
})();

function crc32(str: string): number {
  let crc = 0xffffffff;
  for (let i = 0; i < str.length; i++) {
    crc = CRC32_TABLE[(crc ^ str.charCodeAt(i)) & 0xff] ^ (crc >>> 8);
  }
  return ((crc ^ 0xffffffff) >>> 0) % FIXTURE_MAX_ID;
}

export function fixtureId(label: string): number {
  return crc32(label);
}

function compositeIdentify(label: string, keyCols: readonly string[]): Record<string, number> {
  const base = fixtureId(label);
  const out: Record<string, number> = {};
  keyCols.forEach((col, index) => {
    out[col] = (base * 2 ** index) % FIXTURE_MAX_ID;
  });
  return out;
}

function resolveDeclaredPk(
  tableName: string,
  pkCol: string,
  label: string,
  declared: unknown,
): number | string {
  if (declared === undefined) return fixtureId(label);
  if (typeof declared === "number" && Number.isInteger(declared)) return declared;
  if (typeof declared === "string") return declared;
  throw new Error(
    `defineFixtures: ${tableName}.${label} declares an invalid primary key (${typeof declared}: ${String(declared)}); use an integer or string literal (e.g. \`${pkCol}: 1\` or \`${pkCol}: "foo"\`) or omit the column.`,
  );
}

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE
 */
export function effectiveFixtureKey(model: BaseClass, label: string, row: FixtureAttrs): string {
  const pk = model.primaryKey;
  if (Array.isArray(pk)) {
    const generated = compositeIdentify(label, pk);
    return "c:" + JSON.stringify(pk.map((col) => row[col] ?? generated[col]));
  }
  if (typeof pk !== "string") return "l:" + label;
  return "s:" + String(resolveDeclaredPk(model.tableName, pk, label, row[pk]));
}

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

type DeclaredKey = number | string | Record<string, number | string>;

const declaredIds = new WeakMap<object, Map<string, Map<string, DeclaredKey>>>();

function declaredIdsFor(adapter: object): Map<string, Map<string, DeclaredKey>> {
  let m = declaredIds.get(adapter);
  if (!m) {
    m = new Map();
    declaredIds.set(adapter, m);
  }
  return m;
}

let staticDeclaredIds: Map<string, Map<string, number | string>> | null = null;

async function ensureStaticDeclaredIds(): Promise<void> {
  if (staticDeclaredIds) return;
  const { fixtureRegistry, isJoinTableEntry } = await import("./test-helpers/fixtures-registry.js");
  const map = new Map<string, Map<string, number | string>>();
  const ambiguous = new Set<string>();
  for (const [key, entry] of Object.entries(fixtureRegistry)) {
    if (isJoinTableEntry(entry)) continue;
    const table = underscore(key.split("/").pop() ?? key);
    let labelIds = map.get(table);
    if (!labelIds) {
      labelIds = new Map<string, number | string>();
      map.set(table, labelIds);
    }
    for (const [label, attrs] of Object.entries(entry.data)) {
      const id = (attrs as FixtureAttrs).id;
      if (!((typeof id === "number" && Number.isInteger(id)) || typeof id === "string")) continue;
      const prior = labelIds.get(label);
      if (prior !== undefined && prior !== id) {
        ambiguous.add(`${table}\0${label}`);
        labelIds.delete(label);
      } else if (!ambiguous.has(`${table}\0${label}`)) {
        labelIds.set(label, id);
      }
    }
  }
  staticDeclaredIds = map;
}

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE
 */
export function resolveFixtureId(
  adapter: DatabaseAdapter,
  tableName: string,
  fixtureName: string,
): number | string {
  const declared = declaredIdsFor(adapter).get(tableName)?.get(fixtureName);
  if (declared !== undefined && typeof declared !== "object") return declared;
  const pinned = staticDeclaredIds?.get(tableName)?.get(fixtureName);
  return pinned ?? fixtureId(fixtureName);
}

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE
 */
export function resolveCompositeRefColumn(
  adapter: DatabaseAdapter,
  tableName: string,
  fixtureName: string,
  targetColumn: string,
  targetPkCols: readonly string[],
): number | string {
  const declared = declaredIdsFor(adapter).get(tableName)?.get(fixtureName);
  if (declared !== undefined && typeof declared === "object") {
    const v = declared[targetColumn];
    if (v !== undefined) return v;
  }
  return compositeIdentify(fixtureName, targetPkCols)[targetColumn] ?? fixtureId(fixtureName);
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

export function clearTableRegistry(adapter: DatabaseAdapter): void {
  tableRegistries.delete(adapter);
  declaredIds.delete(adapter);
}

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE
 */
export function resolveModelForTable(
  adapter: DatabaseAdapter,
  tableName: string,
): BaseClass | undefined {
  return getRegistry(adapter).get(tableName);
}

function detectHabtmParts(
  registry: Map<string, BaseClass>,
  tableName: string,
): [string, string] | null {
  const parts = tableName.split("_");
  for (let i = 1; i < parts.length; i++) {
    const left = parts.slice(0, i).join("_");
    const right = parts.slice(i).join("_");
    if (registry.has(left) && registry.has(right)) {
      return [left, right];
    }
  }
  return null;
}

interface ThroughLabelAssoc {
  joinTable: string;
  lhsKey: string;
  rhsKey: string;
  targetTable: string | undefined;
  throughModel: BaseClass | undefined;
  isHabtm: boolean;
}

export function throughLabelAssociations(ModelClass: BaseClass): Map<string, ThroughLabelAssoc> {
  const out = new Map<string, ThroughLabelAssoc>();
  const reflections: Record<string, unknown> = (ModelClass as any)._reflections ?? {};
  for (const [name, refl] of Object.entries(reflections)) {
    const r = refl as {
      parentReflection?: { macro?: string } | null;
      isThroughReflection?: () => boolean;
      foreignKey?: string | string[];
      klass?: { tableName?: string };
      throughReflection?: { foreignKey?: string | string[]; klass?: BaseClass; tableName?: string };
    };
    if (!r.isThroughReflection?.()) continue;
    try {
      const throughModel = r.throughReflection?.klass;
      const joinTable = r.throughReflection?.tableName;
      const lhsKey = r.throughReflection?.foreignKey;
      const rhsKey = r.foreignKey;
      if (
        typeof joinTable !== "string" ||
        typeof lhsKey !== "string" ||
        typeof rhsKey !== "string"
      ) {
        continue;
      }
      out.set(name, {
        joinTable,
        lhsKey,
        rhsKey,
        targetTable: r.klass?.tableName,
        throughModel,
        isHabtm: r.parentReflection?.macro === "hasAndBelongsToMany",
      });
    } catch {
      continue;
    }
  }
  return out;
}

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

function normalizeHabtmTargets(
  tableName: string,
  label: string,
  col: string,
  val: unknown,
): string[] {
  if (Array.isArray(val)) return val.map(String);
  if (typeof val === "string") return val.split(/\s*,\s*/).filter((s) => s.length > 0);
  throw new Error(
    `defineFixtures: ${tableName}.${label} HABTM association "${col}" expects a label string or array of labels, got ${typeof val}`,
  );
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

function reflectionClassFor(
  ModelClass: BaseClass,
  inheritanceCol: string | null,
  row: FixtureAttrs,
): BaseClass {
  if (!inheritanceCol) return ModelClass;
  const typeName = row[inheritanceCol];
  if (typeof typeName !== "string" || !typeName.trim()) return ModelClass;
  try {
    return findStiClass(ModelClass, typeName);
  } catch {
    return ModelClass;
  }
}

function resolveEnums(reflectionClass: BaseClass, row: FixtureAttrs): void {
  const enums = (
    reflectionClass as {
      _enums?: Map<string, Record<string, number | string | boolean | null>>;
    }
  )._enums;
  if (!enums || enums.size === 0) return;
  for (const [name, mapping] of enums) {
    if (!(name in row)) continue;
    const value = row[name];
    if (typeof value === "string" && Object.prototype.hasOwnProperty.call(mapping, value)) {
      row[name] = mapping[value];
    }
  }
}

type BaseClass = typeof Base;
type FixtureAttrs = Record<string, unknown>;
type InsertHost = DatabaseStatementsHost &
  Pick<Quoting, "quote" | "quoteTableName" | "quoteColumnName">;

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
  const seqRows = await adapter.execute(`SELECT pg_get_serial_sequence($1, $2) AS seq`, [
    tableName,
    serialResetCol,
  ]);
  const sequence = seqRows[0]?.seq as string | null | undefined;
  if (!sequence) return;
  const qt = adapter.quoteTableName(tableName);
  const qc = adapter.quoteColumnName(serialResetCol);
  await adapter.executeMutation(
    `SELECT setval($1, GREATEST(COALESCE(MAX(${qc}), 0), 1), COALESCE(MAX(${qc}), 0) <> 0) FROM ${qt}`,
    [sequence],
  );
}

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE
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
    await insertFixturesSet.call(adapter as unknown as InsertHost, merged, Object.keys(merged));
  } catch (err) {
    for (const p of prepared) p.rollback();
    throw err;
  }

  await checkAllForeignKeysValidBang(adapter);

  if (adapter.typeRegistryKey === "postgres") {
    for (const p of prepared) {
      if (p.serialReset) await resetPkSequence(adapter, p.serialReset.table, p.serialReset.column);
    }
  }

  const results: Record<string, unknown>[] = [];
  for (const p of prepared) results.push(await p.finalize());
  return results;
}

async function checkAllForeignKeysValidBang(conn: DatabaseAdapter): Promise<void> {
  if (!ActiveRecord.verifyForeignKeysForFixtures) return;

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

function encryptFixtureRows(ModelClass: BaseClass, rows: FixtureAttrs[]): void {
  const encryptedAttrs = ModelClass.encryptedAttributes ?? new Set<string>();
  const typeMap = new Map<string, EncryptedAttributeType>();
  const pending: Array<{ name: string; scheme: unknown }> =
    (ModelClass as any)._pendingEncryptions ?? [];
  for (const { name, scheme } of pending) {
    const existingType = (ModelClass as any).typeForAttribute(name) as Type;
    const castType =
      existingType instanceof EncryptedAttributeType
        ? existingType.castType
        : existingType === defaultValue()
          ? undefined
          : existingType;
    typeMap.set(name, new EncryptedAttributeType({ scheme: scheme as any, castType }));
  }

  for (const row of rows) {
    const cleanValues: Record<string, unknown> = {};
    for (const attrName of encryptedAttrs) {
      if (!(attrName in row)) continue;
      const cleanValue = row[attrName];
      cleanValues[attrName] = cleanValue;
      const type = typeMap.get(attrName);
      if (!type) continue;
      row[attrName] = type.serialize(cleanValue);
    }
    for (const attrName of encryptedAttrs) {
      const sourceAttrName = EncryptableRecord.sourceAttributeFromPreservedAttribute(attrName);
      if (sourceAttrName === undefined) continue;
      const cleanValue = cleanValues[sourceAttrName];
      if (cleanValue === undefined) continue;
      const type = typeMap.get(attrName);
      if (!type) continue;
      row[attrName] = type.serialize(cleanValue);
    }
  }
}

export async function defineFixtures<T extends BaseClass, K extends string>(
  adapter: DatabaseAdapter,
  ModelClass: T,
  fixtures: Record<K, FixtureAttrs>,
): Promise<{ [P in K]: InstanceType<T> }> {
  const prepared = await prepareModelFixtures(adapter, ModelClass, fixtures);
  const [result] = await insertPreparedFixtureSets(adapter, [prepared]);
  return result as { [P in K]: InstanceType<T> };
}

export async function prepareModelFixtures(
  adapter: DatabaseAdapter,
  ModelClass: BaseClass,
  fixtures: Record<string, FixtureAttrs>,
): Promise<PreparedFixtureSet> {
  await ensureStaticDeclaredIds();
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

  const habtmParts = detectHabtmParts(registry, tableName);
  const habtmFkColToTable: Map<string, string> | null = habtmParts
    ? new Map([
        [`${singularize(habtmParts[0])}_id`, habtmParts[0]],
        [`${singularize(habtmParts[1])}_id`, habtmParts[1]],
      ])
    : null;

  const throughLabelAssocs = throughLabelAssociations(ModelClass);
  const joinTableRows = new Map<
    string,
    { rows: FixtureAttrs[]; throughModel: BaseClass | undefined; isHabtm: boolean }
  >();

  const labels = Object.keys(fixtures);

  const tableIds = new Map<string, DeclaredKey>();
  if (typeof pkCol === "string") {
    for (const label of labels) {
      const id = resolveDeclaredPk(tableName, pkCol, label, fixtures[label][pkCol]);
      tableIds.set(label, id);
    }
  }
  const adapterIds = declaredIdsFor(adapter);
  const priorTableIds = adapterIds.get(tableName);
  adapterIds.set(tableName, tableIds);

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
      try {
        targetPk = refl.klass?.primaryKey;
        jpk = refl.joinPrimaryKey?.();
      } catch {
        continue;
      }
      if (!Array.isArray(targetPk)) continue;
      const fk = refl.foreignKey;
      const fkStr = Array.isArray(fk) ? (fk.length === 1 ? fk[0] : undefined) : fk;
      const jpkStr = Array.isArray(jpk) ? (jpk.length === 1 ? jpk[0] : undefined) : jpk;
      if (typeof fkStr === "string" && typeof jpkStr === "string") {
        fkColToCompositeRef.set(fkStr, { column: jpkStr, pkCols: targetPk as string[] });
      }
    }
  }

  const tableColumns: { name: string; isVirtual(): boolean }[] | null =
    typeof (adapter as any).columns === "function"
      ? await (adapter as any).columns(tableName)
      : null;
  const tableColumnNames = tableColumns ? new Set(tableColumns.map((c) => c.name)) : null;

  const inheritanceCol = ModelClass.inheritanceColumn;

  const rows: FixtureAttrs[] = [];
  for (const label of labels) {
    const attrs = fixtures[label];
    const row: FixtureAttrs =
      typeof pkCol === "string"
        ? { [pkCol]: resolveDeclaredPk(tableName, pkCol, label, attrs[pkCol]) }
        : {};

    for (const [col, val] of Object.entries(attrs)) {
      if (typeof pkCol === "string" && col === pkCol) continue;

      const labelAssoc = throughLabelAssocs.get(col);
      if (labelAssoc) {
        if (typeof pkCol !== "string") {
          throw new Error(
            `defineFixtures: ${tableName}.${label} declares through association "${col}" but the owner table has no single primary key to join on`,
          );
        }
        const ownerId = row[pkCol];
        const targets = normalizeHabtmTargets(tableName, label, col, val);
        if (targets.length > 0) {
          const accum = joinTableRows.get(labelAssoc.joinTable) ?? {
            rows: [],
            throughModel: labelAssoc.throughModel,
            isHabtm: labelAssoc.isHabtm,
          };
          for (const target of targets) {
            accum.rows.push({
              [labelAssoc.lhsKey]: ownerId,
              [labelAssoc.rhsKey]: labelAssoc.targetTable
                ? resolveFixtureId(adapter, labelAssoc.targetTable, target)
                : fixtureId(target),
            });
          }
          joinTableRows.set(labelAssoc.joinTable, accum);
        }
        continue;
      }

      const poly = findPolymorphicRef(ModelClass, col);

      if (!poly) {
        const reflections: Record<string, unknown> = (ModelClass as any)._reflections ?? {};
        const refl = reflections[col] as
          | {
              macro?: string;
              isPolymorphic?: () => boolean;
              joinPrimaryKey?: () => unknown;
              klass?: { primaryKey?: unknown; name?: string };
              foreignKey?: string | string[];
            }
          | undefined;
        if (refl && refl.macro === "belongsTo" && !refl.isPolymorphic?.()) {
          const fkName = refl.foreignKey;
          const fkStr = Array.isArray(fkName) ? fkName[0] : fkName;
          if (col !== fkStr) {
            const jpk = refl.joinPrimaryKey?.();
            const klasspk = refl.klass?.primaryKey;
            if (typeof jpk === "string" && typeof klasspk === "string" && jpk !== klasspk) {
              throw new FixtureSetPrimaryKeyError(
                label,
                col,
                val,
                jpk,
                klasspk,
                typeof fkStr === "string" ? fkStr : col,
                refl.klass?.name ?? "Unknown",
              );
            }
          }
        }
      }

      if (isFixtureRef(val)) {
        if (poly) {
          throw new Error(
            `defineFixtures: "${col}" is a polymorphic association — pass a model instance instead of ref(). ` +
              `Use explicit ${poly.typeColumn}/${poly.idColumn} if you need to reference by ID.`,
          );
        }
        const compRef = fkColToCompositeRef.get(col);
        row[col] = compRef
          ? resolveCompositeRefColumn(
              adapter,
              val.tableName,
              val.fixtureName,
              compRef.column,
              compRef.pkCols,
            )
          : resolveFixtureId(adapter, val.tableName, val.fixtureName);
        continue;
      }

      if (poly) {
        const hasType = poly.typeColumn in attrs;
        const hasId = poly.idColumn in attrs;
        if (hasType !== hasId) {
          throw new Error(
            `defineFixtures: "${col}" — provide both ${poly.typeColumn} and ${poly.idColumn} explicitly, or neither (use the association key instead)`,
          );
        }
        if (hasType) continue;

        if (val === null) {
          row[poly.idColumn] = null;
          row[poly.typeColumn] = null;
          continue;
        }

        if (val instanceof Base) {
          const instance = val as unknown as FixtureAttrs;
          const instanceClass = (instance as any).constructor as BaseClass | undefined;
          const instancePk = (instanceClass as any)?.primaryKey;
          if (Array.isArray(instancePk)) {
            throw new Error(
              `defineFixtures: polymorphic target "${col}" has a composite primary key — pass explicit ${poly.typeColumn} and ${poly.idColumn} instead`,
            );
          }
          const instancePkCol = typeof instancePk === "string" ? instancePk : "id";
          const pkValue = instance[instancePkCol];
          if (pkValue === undefined) {
            throw new Error(
              `defineFixtures: polymorphic target "${col}" has no value for PK column "${instancePkCol}" — ensure the instance exposes its primary key`,
            );
          }
          const typeName: string =
            (instanceClass as any)?.polymorphicName?.() ?? instanceClass?.name ?? "Unknown";
          row[poly.idColumn] = pkValue;
          row[poly.typeColumn] = typeName;
          continue;
        }

        throw new Error(
          `defineFixtures: "${col}" is a polymorphic association — pass a model instance, null, or explicit ${poly.typeColumn}/${poly.idColumn} columns`,
        );
      }

      if (habtmFkColToTable && typeof val === "string") {
        const targetTable = habtmFkColToTable.get(col);
        if (targetTable !== undefined) {
          row[col] = resolveFixtureId(adapter, targetTable, val);
          continue;
        }
      }

      if (val !== null && typeof val === "object" && typeof pkCol === "string" && pkCol in val) {
        row[col] = (val as FixtureAttrs)[pkCol];
      } else {
        row[col] = val;
      }
    }

    if (Array.isArray(pkCol)) {
      const generated = compositeIdentify(label, pkCol);
      for (const keyCol of pkCol) {
        if (keyCol in row) continue;
        if (tableColumnNames !== null && !tableColumnNames.has(keyCol)) continue;
        row[keyCol] = generated[keyCol]!;
      }
      const keyMap: Record<string, number | string> = {};
      for (const keyCol of pkCol) {
        const v = row[keyCol];
        if (typeof v === "number" || typeof v === "string") keyMap[keyCol] = v;
      }
      tableIds.set(label, keyMap);
    }

    resolveEnums(reflectionClassFor(ModelClass, inheritanceCol, row), row);

    rows.push(row);
  }

  if (tableColumns !== null) {
    const cols = tableColumns;

    const virtualNames = new Set(cols.filter((c) => c.isVirtual()).map((c) => c.name));
    if (virtualNames.size > 0) {
      for (const row of rows) {
        for (const name of virtualNames) delete row[name];
      }
    }

    if ((ModelClass as { recordTimestamps?: boolean }).recordTimestamps !== false) {
      const colNames = tableColumnNames!;
      const aliases: Record<string, string> =
        (ModelClass as { attributeAliases?: Record<string, string> }).attributeAliases ?? {};
      const stampCols = TIMESTAMP_COLUMN_NAMES.map((c) => aliases[c] ?? c).filter((c) =>
        colNames.has(c),
      );
      if (stampCols.length > 0) {
        const now = currentTimeFromProperTimezone();
        for (const row of rows) {
          for (const c of stampCols) if (!(c in row)) row[c] = now;
        }
      }
    }
  }

  if (Configurable.config.encryptFixtures && isPresent(ModelClass.encryptedAttributes)) {
    encryptFixtureRows(ModelClass, rows);
  }

  const tables: Record<string, FixtureAttrs[]> = { [tableName]: rows };

  if (joinTableRows.size > 0) {
    const now = currentTimeFromProperTimezone();
    for (const [joinTable, { rows: jrows, throughModel, isHabtm }] of joinTableRows) {
      if (jrows.length === 0) continue;
      if (!isHabtm && typeof (adapter as any).tableExists === "function") {
        const exists: boolean = await (adapter as any).tableExists(joinTable);
        if (!exists) {
          throw new Error(
            `defineFixtures: ${tableName} fixtures expand a plain has_many :through ` +
              `association whose join table "${joinTable}" is not loaded — the ` +
              `requesting test must also load the "${joinTable}" fixture set by name ` +
              `(plain-through join tables are not sliced in automatically; HABTM ones are)`,
          );
        }
      }
      if (throughModel && typeof (adapter as any).columns === "function") {
        const cols: { name: string }[] = await (adapter as any).columns(joinTable);
        const colNames = new Set(cols.map((c) => c.name));
        const aliases: Record<string, string> =
          (throughModel as { attributeAliases?: Record<string, string> }).attributeAliases ?? {};
        const stampCols = TIMESTAMP_COLUMN_NAMES.map((c) => aliases[c] ?? c).filter((c) =>
          colNames.has(c),
        );
        for (const jr of jrows) for (const c of stampCols) if (!(c in jr)) jr[c] = now;
      }
      (tables[joinTable] ??= []).push(...jrows);
    }
  }

  const rollback = () => {
    if (priorTableIds === undefined) {
      adapterIds.delete(tableName);
    } else {
      adapterIds.set(tableName, priorTableIds);
    }
  };

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

  return { tables, serialReset, rollback, finalize };
}

export async function defineJoinTableFixtures(
  adapter: DatabaseAdapter,
  tableName: string,
  fixtures: Record<string, FixtureAttrs>,
): Promise<Record<string, FixtureAttrs>> {
  const prepared = await prepareJoinTableFixtures(adapter, tableName, fixtures);
  const [result] = await insertPreparedFixtureSets(adapter, [prepared]);
  return result as Record<string, FixtureAttrs>;
}

export async function prepareJoinTableFixtures(
  adapter: DatabaseAdapter,
  tableName: string,
  fixtures: Record<string, FixtureAttrs>,
): Promise<PreparedFixtureSet> {
  await ensureStaticDeclaredIds();
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
      row[col] = isFixtureRef(val)
        ? resolveFixtureId(adapter, val.tableName, val.fixtureName)
        : val;
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

export class FixtureSet {
  static async createFixtures<T extends BaseClass, K extends string>(
    adapter: DatabaseAdapter,
    ModelClass: T,
    fixtures: Record<K, FixtureAttrs>,
  ): Promise<{ [P in K]: InstanceType<T> }> {
    return defineFixtures(adapter, ModelClass, fixtures);
  }
}
