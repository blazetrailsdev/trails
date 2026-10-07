import {
  eachPair,
  extend,
  fetch,
  first,
  hasKey,
  flatten,
  Hash,
  isEmpty,
  isModuleIncluded,
  isSymbol,
  partition,
  rbFPublicSend,
  rbFSend,
  rbInspect,
  rbObjAsString,
  rbObjClassname,
  rbObjRespondTo,
  RuntimeError,
  strCount,
  symbolToS,
  toI,
  toS,
  transformValues,
  union,
  uniq,
  TypeError,
} from "@blazetrails/ruby-compat";
import * as Arel from "@blazetrails/arel";
import {
  Nodes,
  Predications,
  SelectManager,
  Table as ArelTable,
  type ArelNode,
} from "@blazetrails/arel";
import {
  ArgumentError,
  Attribute,
  sanitizeForMassAssignment as sanitizeForbiddenAttributes,
} from "@blazetrails/activemodel";
import { PredicateBuilder } from "./predicate-builder.js";
import { DeferredIdsNotIn } from "./predicate-builder/deferred-distinct-pk-in.js";
import { ActiveRecord } from "../namespaces.js";
import { defaultValue } from "../type.js";
import {
  IrreversibleOrderError,
  NotImplementedError,
  PreparedStatementInvalid,
  UnmodifiableRelation,
} from "../errors.js";
import type { AbstractAdapter } from "../connection-adapters/abstract-adapter.js";
import { FromClause } from "./from-clause.js";
import { Map as TypeCasterMap } from "../type-caster/map.js";
import { WhereClause } from "./where-clause.js";
import type { JoinDependency } from "../associations/join-dependency.js";
import type { AliasTracker } from "../associations/alias-tracker.js";
import {
  any,
  actsLike,
  compactBlank,
  defineModule,
  filterMap,
  foreignKey,
  included,
  isBlank,
  kernelArray,
  transformKeys,
  wrap,
} from "@blazetrails/activesupport";

export class WhereChain<R = any> {
  private _scope: R;

  constructor(scope: R) {
    this._scope = scope;
  }

  not(opts: Record<string, unknown>): R;
  not(opts: unknown[]): R;
  not(opts: Record<string, unknown> | unknown[], ...rest: unknown[]): R {
    const scope = this._scope as unknown as QueryMethodsHost;
    const whereClause = buildWhereClause.call(scope, opts, rest);
    scope.whereClause = scope.whereClause.plus(whereClause.invert());
    return this._scope;
  }

  /** @inventedArm if — CONVERGEABLE where-chain-associated-missing-take-the-association-symbol */
  associated(...associations: string[]): R {
    const scope = this._scope as unknown as QueryMethodsHost;
    for (const association of associations) {
      const reflection = this.scopeAssociationReflection(association);
      const reflectionName = `:${reflection.name}`;
      if (
        !scope.joinsValues.includes(reflectionName) &&
        !scope.leftOuterJoinsValues.includes(reflectionName)
      ) {
        joinsBang.call(scope, isRubySymbol(association) ? association : `:${association}`);
      }

      const associationConditions = Object.fromEntries(
        wrap(reflection.associationPrimaryKey()).map((pk) => [pk, null]),
      );
      if (reflection.options.className) {
        this.not({
          [isRubySymbol(association) ? association : `:${association}`]: associationConditions,
        });
      } else {
        this.not({ [reflection.tableName]: associationConditions });
      }
    }

    return this._scope;
  }

  /** @inventedArm if — CONVERGEABLE where-chain-associated-missing-take-the-association-symbol */
  missing(...associations: string[]): R {
    const scope = this._scope as unknown as QueryMethodsHost;
    for (const association of associations) {
      const reflection = this.scopeAssociationReflection(association);
      leftOuterJoinsBang.call(scope, isRubySymbol(association) ? association : `:${association}`);
      const associationConditions = Object.fromEntries(
        wrap(reflection.associationPrimaryKey()).map((pk) => [pk, null]),
      );
      if (reflection.options.className) {
        whereBang.call(scope, {
          [isRubySymbol(association) ? association : `:${association}`]: associationConditions,
        });
      } else {
        whereBang.call(scope, { [reflection.tableName]: associationConditions });
      }
    }

    return this._scope;
  }

  private scopeAssociationReflection(association: string): WhereChainReflection {
    const model = (this._scope as unknown as QueryMethodsHost).model as any;
    const reflection = model?._reflectOnAssociation?.(association);
    if (!reflection) {
      throw new ArgumentError(
        `An association named \`:${association}\` does not exist on the model \`${model?.name}\`.`,
      );
    }
    return reflection;
  }
}

interface WhereChainReflection {
  name: string;
  tableName: string;
  options: Record<string, unknown>;
  associationPrimaryKey(): string | string[];
}

export class CTEJoin {
  readonly name: string;

  constructor(name: string) {
    this.name = name;
  }
}

export type AssociationSpec =
  | string
  | null
  | undefined
  | AssociationSpec[]
  | { [assoc: string]: AssociationSpec | AssociationSpec[] };

export type JoinSpec = AssociationSpec | Nodes.Join | JoinSpec[];

export const FROZEN_EMPTY_ARRAY: readonly never[] = Object.freeze([]);

export const FROZEN_EMPTY_HASH: Readonly<Record<string, never>> = Object.freeze({});

type OrderDirection = ":asc" | ":desc" | ":ASC" | ":DESC" | "asc" | "desc" | "ASC" | "DESC";

export type OrderArg =
  | string
  | Record<string, OrderDirection | Record<string, OrderDirection>>
  | ArelNode
  | string[]
  | [ArelNode, ...unknown[]]
  | Map<ArelNode | string, OrderDirection>
  | null;

interface QueryMethodsHost {
  primaryKey: string | string[];
  _values: Record<string, unknown>;
  _arel?: SelectManager;
  whereClause: WhereClause;
  havingClause: WhereClause;
  fromClause: FromClause;
  includesValues: AssociationSpec[];
  eagerLoadValues: AssociationSpec[];
  preloadValues: AssociationSpec[];
  selectValues: any[];
  groupValues: Array<string | ArelNode>;
  orderValues: Array<string | ArelNode>;
  joinsValues: (AssociationSpec | string | Nodes.Join | JoinDependency)[];
  leftOuterJoinsValues: AssociationSpec[];
  referencesValues: Array<string | Nodes.SqlLiteral>;
  extendingValues: object[];
  unscopeValues: UnscopeArg[];
  optimizerHintsValues: string[];
  annotateValues: string[];
  withValues: Array<Record<string, unknown>>;
  _withIsRecursive: boolean;
  limitValue: number | string | null;
  offsetValue: number | string | null;
  lockValue: string | boolean | null;
  readonlyValue: boolean | null;
  reorderingValue: boolean | null;
  strictLoadingValue: boolean | null;
  reverseOrderValue: boolean | null;
  distinctValue: boolean | null;
  createWithValue: Record<string, unknown>;
  skipQueryCacheValue: boolean | null;
  _isNone: boolean;
  aliasTracker(joins?: Nodes.Node[], aliases?: Hash<string, number>): AliasTracker;
  clone(): any;
  spawn(): any;
  except(...skips: ExceptSkip[]): any;
  /** @internal */
  buildArel(connection: unknown, aliases?: AliasTracker): any;
  skipPreloadingValue: boolean;
  _model: typeof import("../base.js").Base;
  model: QueryMethodsHost["_model"];
  table: ArelTable;
  predicateBuilder: import("./predicate-builder.js").PredicateBuilder;
}

function includes(this: QueryMethodsHost, ...args: AssociationSpec[]): any {
  checkIfMethodHasArgumentsBang.call(this, ":includes", args);
  return includesBang.apply(this.spawn(), args);
}

function includesBang(this: QueryMethodsHost, ...args: AssociationSpec[]): any {
  this.includesValues = union(this.includesValues, args);
  return this;
}

function all(this: QueryMethodsHost): any {
  return this.spawn();
}

function eagerLoad(this: QueryMethodsHost, ...args: AssociationSpec[]): any {
  checkIfMethodHasArgumentsBang.call(this, ":eager_load", args);
  return eagerLoadBang.apply(this.spawn(), args);
}

function eagerLoadBang(this: QueryMethodsHost, ...args: AssociationSpec[]): any {
  this.eagerLoadValues = union(this.eagerLoadValues, args);
  return this;
}

function preload(this: QueryMethodsHost, ...args: AssociationSpec[]): any {
  checkIfMethodHasArgumentsBang.call(this, ":preload", args);
  return preloadBang.apply(this.spawn(), args);
}

function preloadBang(this: QueryMethodsHost, ...args: AssociationSpec[]): any {
  this.preloadValues = union(this.preloadValues, args);
  return this;
}

async function extractAssociated(this: QueryMethodsHost, association: string): Promise<any[]> {
  const records = await preload.call(this, association);
  const associated: any[] = [];
  for (const record of records) associated.push(await record[association]);
  return associated;
}

function references(this: QueryMethodsHost, ...tableNames: Array<string | Nodes.SqlLiteral>): any {
  checkIfMethodHasArgumentsBang.call(this, ":references", tableNames);
  return referencesBang.apply(this.spawn(), tableNames);
}

function referencesBang(
  this: QueryMethodsHost,
  ...tableNames: Array<string | Nodes.SqlLiteral>
): any {
  this.referencesValues = unionReferences(this.referencesValues, tableNames);
  return this;
}

function referenceName(reference: string | Nodes.SqlLiteral): string {
  return reference instanceof Nodes.SqlLiteral ? reference.toString() : reference;
}

function unionReferences(
  a: Array<string | Nodes.SqlLiteral>,
  b: Array<string | Nodes.SqlLiteral>,
): Array<string | Nodes.SqlLiteral> {
  const result = [...a];
  const seen = new Set(a.map(referenceName));
  for (const reference of b) {
    const name = referenceName(reference);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    result.push(reference);
  }
  return result;
}

function withCte(this: QueryMethodsHost, block: (...args: any[]) => unknown): never;
function withCte(this: QueryMethodsHost, ...args: any[]): any;
function withCte(this: QueryMethodsHost, ...args: any[]): any {
  if (args.some((cte) => typeof cte === "function")) {
    throw new ArgumentError("ActiveRecord::Relation#with does not accept a block");
  }
  checkIfMethodHasArgumentsBang.call(this, ":with", args);
  return withBang.apply(this.spawn(), args);
}

function withBang(this: QueryMethodsHost, ...args: unknown[]): any {
  const processed = processWithArgs.call(this, args);
  this.withValues = union(this.withValues, processed);
  return this;
}

function withRecursive(this: QueryMethodsHost, ...args: any[]): any {
  checkIfMethodHasArgumentsBang.call(this, ":with_recursive", args);
  return withRecursiveBang.apply(this.spawn(), args);
}

function withRecursiveBang(this: QueryMethodsHost, ...args: unknown[]): any {
  const processed = processWithArgs.call(this, args);
  this.withValues = union(this.withValues, processed);
  this._withIsRecursive = true;
  return this;
}

function select(this: QueryMethodsHost, block: (record: any) => unknown): Promise<any[]>;
function select(this: QueryMethodsHost, ...fields: any[]): any;
function select(this: QueryMethodsHost, ...fields: any[]): any {
  if (fields.length >= 1 && typeof fields[fields.length - 1] === "function") {
    if (fields.length > 1) {
      throw new ArgumentError("`select' with block doesn't take arguments.");
    }
    return (this as any).records().then((records: any[]) => records.filter(fields[0]));
  }
  checkIfMethodHasArgumentsBang.call(
    this,
    ":select",
    fields,
    "Call `select' with at least one field.",
  );
  fields = processSelectArgs.call(this, fields);
  return _selectBang.apply(this.spawn(), fields);
}

function reselect(this: QueryMethodsHost, ...args: any[]): any {
  checkIfMethodHasArgumentsBang.call(this, ":reselect", args);
  args = processSelectArgs.call(this, args);
  return reselectBang.apply(this.spawn(), args);
}

function reselectBang(this: QueryMethodsHost, ...args: any[]): any {
  this.selectValues = args;
  return this;
}

function _selectBang(this: QueryMethodsHost, ...fields: any[]): any {
  this.selectValues = union(this.selectValues, fields);
  return this;
}

function group(this: QueryMethodsHost, ...args: (string | ArelNode)[]): any {
  checkIfMethodHasArgumentsBang.call(this, ":group", args as unknown[]);
  return groupBang.apply(this.spawn(), args);
}

function groupBang(
  this: QueryMethodsHost,
  ...args: (string | import("@blazetrails/arel").ArelNode)[]
): any {
  this.groupValues = [...this.groupValues, ...(args as string[])];
  return this;
}

function regroup(this: QueryMethodsHost, ...args: string[]): any {
  checkIfMethodHasArgumentsBang.call(this, ":regroup", args);
  return regroupBang.apply(this.spawn(), args);
}

function regroupBang(
  this: QueryMethodsHost,
  ...args: (string | import("@blazetrails/arel").ArelNode)[]
): any {
  this.groupValues = [...(args as string[])];
  return this;
}

function order(this: QueryMethodsHost, ...args: OrderArg[]): any {
  checkIfMethodHasArgumentsBang.call(this, ":order", args as unknown[], undefined, () => {
    sanitizeOrderArguments.call(this, args as unknown[]);
  });
  return orderBang.apply(this.spawn(), args);
}

function orderBang(this: QueryMethodsHost, ...args: OrderArg[]): any {
  if (args.length > 0) preprocessOrderArgs.call(this, args as unknown[]);
  this.orderValues = union(this.orderValues, args as unknown[]) as typeof this.orderValues;
  return this;
}

function inOrderOf(
  this: QueryMethodsHost,
  column: string | ArelNode,
  values: unknown[],
  filter = true,
): any {
  (this.model as any).disallowRawSqlBang([column], {
    permit: (
      this.model.adapterClass() as unknown as { columnNameWithOrderMatcher(): RegExp }
    ).columnNameWithOrderMatcher(),
  });
  if (values.length === 0) return noneBang.call(this.spawn());

  const references = columnReferences([column]);
  if (references.length > 0) referencesBang.call(this, ...references);

  const typeCaster = new TypeCasterMap(this.model);
  values = values.map((value) => {
    if (value === undefined || value === null) return null;
    return typeCaster.typeCastForDatabase(column, value);
  });

  const arelColumn: any =
    column instanceof Nodes.SqlLiteral ? column : orderColumn.call(this, String(column));

  let scope = orderBang.call(
    this.spawn(),
    buildCaseForValuePosition.call(this, arelColumn, values, { filter }) as any,
  );

  if (filter) {
    const whereClause: Nodes.Node = values.includes(null)
      ? (arelColumn.in(values.filter((v) => v !== null)) as Nodes.Node).or(arelColumn.eq(null))
      : arelColumn.in(values);

    scope = whereBang.call(scope, whereClause);
  }

  return scope;
}

function reorder(this: QueryMethodsHost, ...args: OrderArg[]): any {
  checkIfMethodHasArgumentsBang.call(this, ":reorder", args as unknown[], undefined, () => {
    sanitizeOrderArguments.call(this, args as unknown[]);
  });
  return reorderBang.apply(this.spawn(), args);
}

function reorderBang(this: QueryMethodsHost, ...args: OrderArg[]): any {
  preprocessOrderArgs.call(this, args as unknown[]);
  args = uniq(args);
  this.reorderingValue = true;
  this.orderValues = args as typeof this.orderValues;
  return this;
}
export type UnscopeType =
  | "where"
  | "select"
  | "group"
  | "order"
  | "lock"
  | "limit"
  | "offset"
  | "joins"
  | "leftOuterJoins"
  | "includes"
  | "preload"
  | "eagerLoad"
  | "from"
  | "readonly"
  | "having"
  | "optimizerHints"
  | "annotate"
  | "createWith"
  | "with";

export const VALID_UNSCOPING_VALUES: ReadonlySet<UnscopeType> = new Set<UnscopeType>([
  "where",
  "select",
  "group",
  "order",
  "lock",
  "limit",
  "offset",
  "joins",
  "leftOuterJoins",
  "includes",
  "preload",
  "eagerLoad",
  "from",
  "readonly",
  "having",
  "optimizerHints",
  "annotate",
  "createWith",
  "with",
]);

export type UnscopeArg = `:${UnscopeType}` | ":leftJoins" | { ":where": string | string[] };

export type ExceptKey =
  | UnscopeType
  | "distinct"
  | "strictLoading"
  | "references"
  | "extending"
  | "unscope"
  | "reordering"
  | "skipQueryCache"
  | "reverseOrder";

export const EXCEPT_ONLY_KEYS: readonly ExceptKey[] = [
  ...VALID_UNSCOPING_VALUES,
  "distinct",
  "strictLoading",
  "references",
  "extending",
  "unscope",
  "reordering",
  "skipQueryCache",
  "reverseOrder",
];

export type ExceptSkip = ExceptKey | (string & {});

function unscope(this: QueryMethodsHost, ...args: UnscopeArg[]): any {
  checkIfMethodHasArgumentsBang.call(this, ":unscope", args as unknown[]);
  return unscopeBang.apply(this.spawn(), args);
}

function unscopeBang(this: QueryMethodsHost, ...args: UnscopeArg[]): any {
  this.unscopeValues = [...this.unscopeValues, ...args];

  for (let scope of args as unknown[]) {
    if (isRubySymbol(scope)) {
      if (scope === ":leftJoins") scope = ":leftOuterJoins";
      const name = (scope as string).slice(1) as UnscopeType;
      if (!VALID_UNSCOPING_VALUES.has(name)) {
        throw new ArgumentError(
          `Called unscope() with invalid unscoping argument '${scope}'. Valid arguments are :${[...VALID_UNSCOPING_VALUES].join(", :")}.`,
        );
      }
      assertModifiableBang.call(this);
      delete this._values[name];
    } else if (rbObjClassname(scope) === "Hash") {
      for (const [key, targetValue] of Object.entries(scope as object)) {
        if (key !== ":where") {
          throw new ArgumentError("Hash arguments in .unscope(*args) must have :where as the key.");
        }

        const targetValues = resolveArelAttributes.call(this, wrap(targetValue));
        this.whereClause = this.whereClause.except(...targetValues);
      }
    } else {
      throw new ArgumentError(
        `Unrecognized scoping: ${rbInspect(args)}. Use .unscope(where: :attribute_name) or .unscope(:order), for example.`,
      );
    }
  }

  return this;
}

function joins(this: QueryMethodsHost, ...args: JoinSpec[]): any {
  checkIfMethodHasArgumentsBang.call(this, ":joins", args as unknown[]);
  return joinsBang.apply(this.spawn(), args as (string | Nodes.Join)[]);
}

function joinsBang(this: QueryMethodsHost, ...args: (string | Nodes.Join | JoinDependency)[]): any {
  this.joinsValues = union(this.joinsValues, args);
  return this;
}

function leftOuterJoins(this: QueryMethodsHost, ...args: AssociationSpec[]): any {
  checkIfMethodHasArgumentsBang.call(this, ":left_outer_joins", args);
  return leftOuterJoinsBang.apply(this.spawn(), args);
}

function leftJoins(this: QueryMethodsHost, ...args: AssociationSpec[]): any {
  checkIfMethodHasArgumentsBang.call(this, ":left_joins", args);
  return leftOuterJoinsBang.apply(this.spawn(), args);
}

function leftOuterJoinsBang(this: QueryMethodsHost, ...args: AssociationSpec[]): any {
  this.leftOuterJoinsValues = union(this.leftOuterJoinsValues, args);
  return this;
}

/** @internal */
export function buildWhereClause(
  this: QueryMethodsHost,
  opts: unknown,
  rest: unknown[] = [],
): WhereClause {
  opts = sanitizeForbiddenAttributes(opts as Record<string, unknown>);

  if (Array.isArray(opts)) {
    [opts, ...rest] = opts as unknown[];
  }

  let parts: (Nodes.Node | Nodes.SqlLiteral | string)[];
  if (typeof opts === "string" || opts instanceof Nodes.SqlLiteral) {
    opts = opts.toString();
    if (isEmpty(rest)) {
      parts = [Arel.sql(opts as string)];
    } else if (isPlainObject(rest[0]) && /:\w+/.test(opts as string)) {
      parts = [buildNamedBoundSqlLiteral.call(this, opts as string, rest[0])];
    } else if ((opts as string).includes("?")) {
      parts = [buildBoundSqlLiteral.call(this, opts as string, rest)];
    } else {
      parts = [
        this.model.sanitizeSql(isEmpty(rest) ? (opts as string) : [opts as string, ...rest])!,
      ];
    }
  } else if (isHash(opts)) {
    opts = transformKeys(opts as Record<string, unknown>, (key: string | string[]) => {
      if (Array.isArray(key)) {
        return key.map((k) => this.model.attributeAliases[toS(k)] || toS(k)) as never;
      } else {
        key = toS(key);
        return this.model.attributeAliases[key] || key;
      }
    });
    const references = PredicateBuilder.references(opts as Record<string, unknown>);
    if (!isEmpty(references)) {
      this.referencesValues = unionReferences(this.referencesValues, references);
    }

    parts = this.predicateBuilder.buildFromHash(
      opts as Record<string, unknown>,
      (tableName: string) => lookupTableKlassFromJoinDependencies.call(this, tableName),
    );
  } else if (opts instanceof Nodes.Node) {
    parts = [opts];
  } else {
    throw new ArgumentError(`Unsupported argument type: ${String(opts)} (${rbObjClassname(opts)})`);
  }

  return new WhereClause(parts);
}

function where(
  this: QueryMethodsHost,
  conditionsOrSql?:
    | Record<string, unknown>
    | Map<unknown, unknown>
    | string
    | Nodes.Node
    | Nodes.SqlLiteral
    | string[]
    | unknown[]
    | null,
  ...rest: unknown[]
): any {
  if (conditionsOrSql === undefined) return new WhereChain(this.spawn());
  if (rest.length === 0 && isBlank(conditionsOrSql)) {
    return this;
  }
  return whereBang.call(
    this.spawn(),
    conditionsOrSql as Record<string, unknown> | string | ArelNode | null,
    ...rest,
  );
}

function whereBang(this: QueryMethodsHost, opts: any, ...rest: unknown[]): any {
  const clause = buildWhereClause.call(this, opts, rest);
  this.whereClause = this.whereClause.plus(clause);
  return this;
}

function rewhere(this: QueryMethodsHost, conditions: Record<string, unknown> | null): any {
  if (conditions == null) return unscope.call(this, ":where");
  conditions = sanitizeForbiddenAttributes(conditions);
  const rel = this.spawn();
  const newClause = buildWhereClause.call(rel, conditions);
  rel.whereClause = rel.whereClause.except(...newClause.extractAttributes());
  rel.whereClause = rel.whereClause.plus(newClause);
  return rel;
}

function isRelationLike(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "_model" in value &&
    typeof (value as { arel?: unknown }).arel === "function"
  );
}

function invertWhere(this: QueryMethodsHost): any {
  return invertWhereBang.call(this.spawn());
}

function invertWhereBang(this: QueryMethodsHost): any {
  this.whereClause = this.whereClause.invert();
  return this;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return false;

  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  if (Array.isArray(b)) return false;

  // boundary: deepEqual underpins the and!/or! merge-compatibility check
  if (a instanceof Date) return b instanceof Date && Object.is(a.getTime(), b.getTime());
  // boundary: paired with the `a instanceof Date` branch above.
  if (b instanceof Date) return false;

  // boundary: every caller here is a Ruby `Array#|` union or a `Hash#eql?`
  const aAny = a as { eql?: (x: unknown) => boolean; equals?: (x: unknown) => boolean };
  if (typeof aAny.eql === "function" && !isAsyncFunction(aAny.eql)) return aAny.eql(b);
  if (typeof aAny.equals === "function" && !isAsyncFunction(aAny.equals)) return aAny.equals(b);

  if (!isPlainObject(a) || !isPlainObject(b)) return false;

  const ak = Object.keys(a).sort();
  const bk = Object.keys(b).sort();
  if (ak.length !== bk.length) return false;
  for (let i = 0; i < ak.length; i++) {
    if (ak[i] !== bk[i]) return false;
    if (!deepEqual(a[ak[i]], b[bk[i]])) return false;
  }
  return true;
}

function isAsyncFunction(fn: object): boolean {
  return Object.prototype.toString.call(fn) === "[object AsyncFunction]";
}

function isHash(value: unknown): value is Record<string, unknown> | Map<unknown, unknown> {
  return isPlainObject(value) || value instanceof Map;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const STRUCTURAL_VALUE_METHODS: readonly string[] = [
  "includes",
  "eagerLoad",
  "preload",
  "select",
  "group",
  "order",
  "joins",
  "leftOuterJoins",
  "with",
  "limit",
  "offset",
  "lock",
  "readonly",
  "reordering",
  "strictLoading",
  "reverseOrder",
  "distinct",
  "createWith",
  "skipQueryCache",
  "from",
];

/** @internal */
export function structurallyIncompatibleValuesFor(
  this: QueryMethodsHost,
  other: QueryMethodsHost,
): string[] {
  const values = other._values;
  const incompat = STRUCTURAL_VALUE_METHODS.filter((method) => {
    let v1 = this._values[method];
    let v2 = values[method];
    if (Array.isArray(v1)) {
      if (!Array.isArray(v2)) return false;
      v1 = uniq(v1);
      v2 = uniq(v2);
    }
    return !deepEqual(v1, v2);
  });
  return incompat;
}

function rubyClassNameOf(value: unknown): string {
  if (value === null) return "NilClass";
  if (Array.isArray(value)) return "Array";
  switch (typeof value) {
    case "object": {
      const ctor = value.constructor;
      return ctor && ctor !== Object ? ctor.name : "Hash";
    }
    case "string":
      return "String";
    case "boolean":
      return value ? "TrueClass" : "FalseClass";
    case "number":
      return Number.isInteger(value) ? "Integer" : "Float";
    default:
      return typeof value;
  }
}

function assertRelationForCombining(other: unknown, methodName: string): void {
  if (!(other instanceof ActiveRecord.Relation)) {
    throw new ArgumentError(
      `You have passed ${rubyClassNameOf(other)} object to #${methodName}. Pass an ActiveRecord::Relation object instead.`,
    );
  }
}

function assertStructurallyCompatible(
  self: QueryMethodsHost,
  other: QueryMethodsHost,
  methodName: string,
): void {
  const incompat = structurallyIncompatibleValuesFor.call(self, other);
  if (incompat.length > 0) {
    throw new ArgumentError(
      `Relation passed to #${methodName} must be structurally compatible. Incompatible values: [${incompat.map((v) => `:${v}`).join(", ")}]`,
    );
  }
}

function structurallyCompatible(this: QueryMethodsHost, other: any): boolean {
  return structurallyIncompatibleValuesFor.call(this, other).length === 0;
}

function and(this: QueryMethodsHost, other: any): any {
  return andBang.call(this.spawn(), other);
}

function andBang(this: QueryMethodsHost, other: any): any {
  assertRelationForCombining(other, "and");
  assertStructurallyCompatible(this, other, "and");
  this.whereClause = this.whereClause.union(other.whereClause);
  this.havingClause = this.havingClause.union(other.havingClause);
  this.referencesValues = unionReferences(this.referencesValues, other.referencesValues);
  return this;
}

function or(this: QueryMethodsHost, other: any): any {
  assertRelationForCombining(other, "or");
  if (this._isNone) return other.spawn();
  return orBang.call(this.spawn(), other);
}

function orBang(this: QueryMethodsHost, other: any): any {
  assertRelationForCombining(other, "or");
  assertStructurallyCompatible(this, other, "or");
  this.whereClause = this.whereClause.or(other.whereClause);
  this.havingClause = this.havingClause.or(other.havingClause);
  this.referencesValues = unionReferences(this.referencesValues, other.referencesValues);
  return this;
}

function having(
  this: QueryMethodsHost,
  opts: string | Record<string, unknown> | Nodes.Node | Nodes.SqlLiteral,
  ...rest: unknown[]
): any {
  if (opts == null || isBlank(opts)) return this;
  return havingBang.call(this.spawn(), opts, ...rest);
}

function havingBang(
  this: QueryMethodsHost,
  opts: string | Record<string, unknown> | Nodes.Node | Nodes.SqlLiteral,
  ...rest: unknown[]
): any {
  this.havingClause = this.havingClause.plus(buildWhereClause.call(this, opts, rest));
  return this;
}

function limit(this: QueryMethodsHost, value: number | string | null): any {
  return limitBang.call(this.spawn(), value);
}

function limitBang(this: QueryMethodsHost, value: number | string | null): any {
  this.limitValue = value;
  return this;
}

function offset(this: QueryMethodsHost, value: number | string | null): any {
  return offsetBang.call(this.spawn(), value);
}

function offsetBang(this: QueryMethodsHost, value: number | string | null): any {
  this.offsetValue = value;
  return this;
}

function lock(this: QueryMethodsHost, locks: string | boolean | null = true): any {
  return lockBang.call(this.spawn(), locks);
}

function lockBang(this: QueryMethodsHost, locks: string | boolean | null = true): any {
  if (typeof locks === "string" || locks === true || locks == null) {
    this.lockValue = locks ?? true;
  } else {
    this.lockValue = false;
  }
  return this;
}

function none(this: QueryMethodsHost): any {
  return noneBang.call(this.spawn());
}

function noneBang(this: QueryMethodsHost): any {
  if (!this._isNone) {
    this.whereClause = this.whereClause.plus(new WhereClause([new Nodes.SqlLiteral("1=0")]));
    this._isNone = true;
  }
  return this;
}

function isNullRelation(this: QueryMethodsHost): boolean {
  return this._isNone;
}

function readonly(this: QueryMethodsHost, value = true): any {
  return readonlyBang.call(this.spawn(), value);
}

function readonlyBang(this: QueryMethodsHost, value = true): any {
  this.readonlyValue = value;
  return this;
}

function strictLoading(this: QueryMethodsHost, value = true): any {
  return strictLoadingBang.call(this.spawn(), value);
}

function strictLoadingBang(this: QueryMethodsHost, value = true): any {
  this.strictLoadingValue = value;
  return this;
}

function createWith(this: QueryMethodsHost, value: Record<string, unknown> | null): any {
  return createWithBang.call(this.spawn(), value);
}

function createWithBang(this: QueryMethodsHost, value: Record<string, unknown> | null): any {
  if (value) {
    value = sanitizeForbiddenAttributes(value);
    this.createWithValue = { ...this.createWithValue, ...value };
  } else {
    this.createWithValue = {};
  }
  return this;
}

function from(this: QueryMethodsHost, value: any, subqueryName?: string): any {
  return fromBang.call(this.spawn(), value, subqueryName);
}

function fromBang(this: QueryMethodsHost, value: any, subqueryName?: string): any {
  this.fromClause = new FromClause(value ?? null, subqueryName ?? null);
  return this;
}

function distinct(this: QueryMethodsHost, value = true): any {
  return distinctBang.call(this.spawn(), value);
}

function distinctBang(this: QueryMethodsHost, value = true): any {
  this.distinctValue = value;
  return this;
}

function extending(this: QueryMethodsHost, ...modules: Array<object | ((rel: any) => void)>): any {
  if (modules.some((mod) => mod != null && (mod as unknown) !== false)) {
    return extendingBang.call(this.spawn(), ...modules);
  } else {
    return this;
  }
}

function extendingBang(
  this: QueryMethodsHost,
  ...modules: Array<object | ((rel: any) => void)>
): any {
  for (const mod of modules) {
    if (typeof mod === "function") {
      mod(this);
    } else {
      this.extendingValues = [...this.extendingValues, mod];
    }
  }
  for (const mod of [...this.extendingValues].reverse()) extend(this, mod);
  return this;
}

function optimizerHints(this: QueryMethodsHost, ...args: string[]): any {
  checkIfMethodHasArgumentsBang.call(this, ":optimizer_hints", args);
  return optimizerHintsBang.apply(this.spawn(), args);
}

function optimizerHintsBang(this: QueryMethodsHost, ...args: string[]): any {
  this.optimizerHintsValues = union(this.optimizerHintsValues, args);
  return this;
}

function reverseOrder(this: QueryMethodsHost): any {
  return reverseOrderBang.call(this.spawn());
}

function reverseOrderBang(this: QueryMethodsHost): any {
  const orders = compactBlank(this.orderValues as unknown[]);
  this.orderValues = reverseSqlOrder.call(this, orders) as typeof this.orderValues;
  return this;
}

function skipQueryCacheBang(this: QueryMethodsHost, value = true): any {
  this.skipQueryCacheValue = value;
  return this;
}

function skipPreloadingBang(this: QueryMethodsHost): any {
  this.skipPreloadingValue = true;
  return this;
}

function annotate(this: QueryMethodsHost, ...args: string[]): any {
  checkIfMethodHasArgumentsBang.call(this, ":annotate", args);
  return annotateBang.apply(this.spawn(), args);
}

function annotateBang(this: QueryMethodsHost, ...args: string[]): any {
  this.annotateValues = [...this.annotateValues, ...args];
  return this;
}

function uniqBang(this: QueryMethodsHost, name?: string): any {
  if (name === undefined) return this;
  const values = this._values[name];
  if (Array.isArray(values) && values.length > 0) {
    this._values[name] = uniq(values);
  }
  return this;
}

function excludingWithCallee(callee: "excluding" | "without") {
  return function (this: QueryMethodsHost, ...records: unknown[]): any {
    const relations = records.filter((r) => r instanceof ActiveRecord.Relation) as any[];
    records = records
      .filter((r) => !(r instanceof ActiveRecord.Relation))
      .flat(1)
      .filter((r) => r != null);

    const model = this.model;
    if (
      !records.every((r) => r instanceof (model as any)) ||
      !relations.every((relation) => relation.model === model)
    ) {
      throw new ArgumentError(
        `You must only pass a single or collection of ${model.name} objects to #${callee}.`,
      );
    }

    const flatMappedIds: unknown[] = [];
    const deferredRelations: any[] = [];
    for (const relation of relations) {
      if (!relation.isLoaded || relation.isScheduled || relation._loadResult) {
        deferredRelations.push(relation);
        continue;
      }
      flatMappedIds.push(...(relation.ids() as unknown[]));
    }
    const combined: unknown[] = [...records, ...flatMappedIds, ...deferredRelations];
    return excludingBang.call(this.spawn(), combined);
  };
}

const excluding = excludingWithCallee("excluding");

const without = excludingWithCallee("without");

function excludingBang(this: QueryMethodsHost, records: any[]): any {
  const pk = this.primaryKey;

  const deferredRelations = records.filter((r) => isRelationLike(r));
  const literalRecords = records.filter((r) => !isRelationLike(r));

  if (deferredRelations.length === 0) {
    this.whereClause = this.whereClause.plus(
      new WhereClause([
        this.predicateBuilder
          .build(this.predicateBuilder.table.arelTable.get(pk as string), literalRecords)
          .invert(),
      ]),
    );
    return this;
  }

  const attribute = this.predicateBuilder.table.arelTable.get(pk as string);
  const literalIds = literalRecords.map((r) =>
    r instanceof ActiveRecord.Base ? (r as any).id : r,
  );
  const inlineSubquery = (
    this.predicateBuilder.build(
      attribute,
      this.model.unscoped().merge(deferredRelations[0]),
    ) as Nodes.In
  ).right as ArelNode;
  this.whereClause = this.whereClause.plus(
    new WhereClause([
      new DeferredIdsNotIn(attribute, inlineSubquery, [
        { ids: () => Promise.resolve(literalIds) },
        ...deferredRelations,
      ]),
    ]),
  );
  return this;
}

/** @missingRailsCall with_connection — CONVERGEABLE relation-layer-with-connection-receipts-are-not-the-tosql-sites */
export function arel(this: QueryMethodsHost, aliases?: AliasTracker): any {
  return (this._arel ??= this.model
    .connectionPool()
    .withConnectionSync((c) => this.buildArel(c, aliases)));
}

export function constructJoinDependency(
  this: QueryMethodsHost,
  associations: string | AssociationSpec[],
  joinType?: unknown,
): JoinDependency {
  return new ActiveRecord.Associations.JoinDependency(
    this.model,
    this.table,
    associations,
    (joinType ?? null) as typeof Nodes.InnerJoin | typeof Nodes.OuterJoin | null,
  );
}

// @internal

/** @internal */
function asyncBang(this: QueryMethodsHost): QueryMethodsHost {
  (this as any)._async = true;
  return this;
}

/** @internal */
export function async(this: QueryMethodsHost): QueryMethodsHost {
  return asyncBang.call((this as any).spawn());
}

/** @internal */
export function assertModifiableBang(this: QueryMethodsHost): void {
  if ((this as any)._loaded || this._arel) {
    throw new UnmodifiableRelation();
  }
}

/** @internal */
export function checkIfMethodHasArgumentsBang(
  this: QueryMethodsHost,
  methodName: string,
  args: unknown[],
  message?: string,
  block?: (args: unknown[]) => void,
): void {
  if (isBlank(args)) {
    throw new ArgumentError(
      message ?? `The method .${methodName.slice(1)}() must contain arguments.`,
    );
  } else {
    if (block) block(args);

    args.splice(0, args.length, ...flatten(args));
    args.splice(0, args.length, ...compactBlank(args));
  }
}

/** @internal */
export function flattenedArgs(args: unknown[]): unknown[] {
  return args.flatMap((e) =>
    isPlainObject(e) || e instanceof Map || Array.isArray(e) ? flattenedArgs(toA(e)) : e,
  );
}

function toA(value: unknown[] | Map<unknown, unknown> | Record<string, unknown>): unknown[] {
  if (Array.isArray(value)) return value;
  if (value instanceof Map) return [...value].map(([k, v]) => [k, v]);
  return Object.entries(value);
}

const VALID_DIRECTIONS = new Set([":asc", ":desc", ":ASC", ":DESC", "asc", "desc", "ASC", "DESC"]);

/** @internal */
export function validateOrderArgs(this: QueryMethodsHost, args: unknown[]): void {
  for (const arg of args) {
    if (!isHash(arg)) continue;
    eachPair(arg as Record<string, unknown>, (_key, value) => {
      if (isHash(value)) {
        validateOrderArgs.call(this, [value]);
      } else if (!VALID_DIRECTIONS.has(value as string)) {
        throw new ArgumentError(
          `Direction "${value}" is invalid. Valid directions are: ${rbInspect([...VALID_DIRECTIONS])}`,
        );
      }
    });
  }
}

/** @internal */
export function processWithArgs(
  this: QueryMethodsHost,
  args: unknown[],
): Record<string, unknown>[] {
  return args.flatMap((arg) => {
    if (!isPlainObject(arg)) {
      throw new ArgumentError(
        `Unsupported argument type: ${rbObjAsString(arg)} ${rbObjClassname(arg)}`,
      );
    }
    return Object.entries(arg).map(([k, v]) => ({ [k]: v }));
  });
}

/** @internal */
export function buildCastValue(name: string, value: unknown): Attribute {
  return Attribute.withCastValue(name, value, defaultValue());
}

/** @internal */
export function buildNamedBoundSqlLiteral(
  this: QueryMethodsHost,
  statement: string,
  values: Record<string, unknown>,
): Nodes.BoundSqlLiteral {
  const boundValues = transformValues(values, (value) => {
    if (value instanceof ActiveRecord.Relation) {
      return Arel.sql(value.toSql());
    } else if (rbObjRespondTo(value, "map") && !actsLike.call(value, "string")) {
      const values = (value as { map<R>(b: (v: unknown) => R): R[] }).map((v) =>
        rbObjRespondTo(v, "idForDatabase") ? (v as { idForDatabase: unknown }).idForDatabase : v,
      );
      return values.length === 0 ? null : values;
    } else {
      if (rbObjRespondTo(value, "idForDatabase")) {
        value = (value as { idForDatabase: unknown }).idForDatabase;
      }
      return value;
    }
  });

  try {
    return new Nodes.BoundSqlLiteral(`(${statement})`, null, boundValues);
  } catch (error) {
    if (error instanceof Arel.BindError) {
      throw new PreparedStatementInvalid(error.message, { cause: error });
    }
    throw error;
  }
}

/** @internal */
export function buildBoundSqlLiteral(
  this: QueryMethodsHost,
  statement: string,
  values: unknown[],
): Nodes.BoundSqlLiteral {
  const boundValues = values.map((value) => {
    if (value instanceof ActiveRecord.Relation) {
      return Arel.sql(value.toSql());
    } else if (rbObjRespondTo(value, "map") && !actsLike.call(value, "string")) {
      const values = (value as { map<R>(b: (v: unknown) => R): R[] }).map((v) =>
        rbObjRespondTo(v, "idForDatabase") ? (v as { idForDatabase: unknown }).idForDatabase : v,
      );
      return values.length === 0 ? null : values;
    } else {
      if (rbObjRespondTo(value, "idForDatabase")) {
        value = (value as { idForDatabase: unknown }).idForDatabase;
      }
      return value;
    }
  });

  try {
    return new Nodes.BoundSqlLiteral(`(${statement})`, boundValues, null);
  } catch (error) {
    if (error instanceof Arel.BindError) {
      throw new PreparedStatementInvalid(error.message, { cause: error });
    }
    throw error;
  }
}

/** @internal */
export function buildSubquery(
  this: QueryMethodsHost,
  subqueryAlias: string | Nodes.SqlLiteral,
  selectValue: unknown,
): SelectManager {
  const subquery = this.except("optimizerHints").arel().as(subqueryAlias);

  const arel = new SelectManager(subquery).project(selectValue as any);
  if (!isEmpty(this.optimizerHintsValues)) arel.optimizerHints(...this.optimizerHintsValues);
  return arel;
}

/** @internal */
export function isDoesNotSupportReverse(order: string | Nodes.SqlLiteral): boolean {
  if (typeof order !== "string") order = String(order);
  return (
    (order.includes(",") &&
      order.split(",").find((section) => strCount(section, ["("]) !== strCount(section, [")"])) !==
        undefined) ||
    /\bnulls\s+(?:first|last)\b/i.test(order)
  );
}

/** @internal */
export function reverseSqlOrder(this: QueryMethodsHost, orderQuery: unknown[]): unknown[] {
  if (orderQuery.length === 0) {
    const primaryKey = this.model.primaryKey as string;
    if (primaryKey) return [this.table.get(primaryKey).desc()];
    throw new IrreversibleOrderError(
      "Relation has no current order and table has no primary key to be used as default order",
    );
  }
  return orderQuery.flatMap((o) => {
    if (o instanceof Arel.Attribute) return [o.desc()];
    if (o instanceof Nodes.Ordering) return [(o as Nodes.Ascending | Nodes.Descending).reverse()];
    if (o instanceof Nodes.NodeExpression) return [o.desc()];
    if (typeof o === "string" || o instanceof Nodes.SqlLiteral) {
      if (isDoesNotSupportReverse(o)) {
        throw new IrreversibleOrderError(
          `Order ${rbInspect(String(o))} cannot be reversed automatically`,
        );
      }
      return String(o)
        .split(",")
        .map((s) => {
          s = s.trim();
          return (
            (/\sasc$/i.test(s) && s.replace(/\sasc$/i, " DESC")) ||
            (/\sdesc$/i.test(s) && s.replace(/\sdesc$/i, " ASC")) ||
            `${s} DESC`
          );
        });
    }
    return [o];
  });
}

/** @internal */
export function extractTableNameFrom(string: string): string | null {
  const match = toS(string).match(/^\W?(\w+)\W?\./);
  return match && match[1];
}

function isRubySymbol(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(":");
}

function symbolToName(s: string): string {
  const name = s.slice(1);
  if (name.trim() === "") {
    throw new ArgumentError("Order symbols must have a non-blank name");
  }
  return name;
}

/** @internal */
export function columnReferences(orderArgs: unknown[]): Nodes.SqlLiteral[] {
  return filterMap(
    orderArgs.flatMap((arg) => {
      if (typeof arg === "string") {
        return extractTableNameFrom(arg);
      } else if (isHash(arg)) {
        return (toA(arg) as [unknown, unknown][]).map(([key, value]) => {
          if (isHash(value)) {
            return toS(key);
          } else {
            return typeof key === "string" ? extractTableNameFrom(key) : null;
          }
        });
      } else if (arg instanceof Arel.Attribute) {
        return arg.relation.name;
      } else if (arg instanceof Nodes.Ordering) {
        return arg.expr instanceof Arel.Attribute ? arg.expr.relation.name : null;
      } else {
        return null;
      }
    }),
    (ref) => (ref != null ? Arel.sql(ref as string, { retryable: true }) : null),
  );
}

/** @internal */
export function sanitizeOrderArguments(this: QueryMethodsHost, orderArgs: unknown[]): unknown[] {
  orderArgs.splice(
    0,
    orderArgs.length,
    ...orderArgs.map((arg) => this.model.sanitizeSqlForOrder(arg as string | ArelNode)),
  );
  return orderArgs;
}

/** @internal */
export function preprocessOrderArgs(this: QueryMethodsHost, orderArgs: unknown[]): void {
  this.model.disallowRawSqlBang(flattenedArgs(orderArgs) as (string | symbol | ArelNode)[], {
    permit: (
      this.model.adapterClass() as unknown as { columnNameWithOrderMatcher(): RegExp }
    ).columnNameWithOrderMatcher(),
  });

  validateOrderArgs.call(this, orderArgs);

  const references = columnReferences(orderArgs);
  if (!isEmpty(references)) {
    this.referencesValues = unionReferences(this.referencesValues, references);
  }

  orderArgs.splice(
    0,
    orderArgs.length,
    ...flatten(
      orderArgs.map((arg) => {
        if (isSymbol(arg)) {
          return (orderColumn.call(this, symbolToS(arg)) as Nodes.SqlLiteral).asc();
        } else if (isHash(arg)) {
          return (toA(arg) as [unknown, unknown][]).map(([key, value]) => {
            if (isHash(value)) {
              return (toA(value) as [unknown, unknown][]).map(([field, dir]) =>
                rbFPublicSend(
                  orderColumn.call(this, [toS(key), toS(field)].join(".")),
                  rbFSend(dir, "downcase"),
                ),
              );
            } else {
              if (
                key instanceof Nodes.SqlLiteral ||
                key instanceof Nodes.Node ||
                key instanceof Arel.Attribute
              ) {
                return rbFPublicSend(key, rbFSend(value, "downcase"));
              } else {
                return rbFPublicSend(orderColumn.call(this, toS(key)), rbFSend(value, "downcase"));
              }
            }
          });
        } else {
          return arg;
        }
      }),
    ),
  );
}

/** @internal */
export function buildOrder(this: QueryMethodsHost, arel: any): unknown {
  const orders = compactBlank(((this as any).orderValues ?? []) as unknown[]);
  if (orders.length > 0) return arel.order?.(...orders);
}

/** @internal */
export function buildCaseForValuePosition(
  this: QueryMethodsHost,
  column: unknown,
  values: unknown[],
  options: { filter?: boolean } = {},
): unknown {
  const filter = options.filter !== false;
  const node = new Nodes.Case();
  values.forEach((value, i) => {
    node.when((column as any).eq(value)).then(i + 1);
  });
  if (!filter) (node as any).else(values.length + 1);
  return new Nodes.Ascending(node);
}

/** @internal */
export function resolveArelAttributes(this: QueryMethodsHost, attrs: unknown[]): unknown[] {
  return attrs.flatMap((attr) => {
    if (attr != null && isModuleIncluded((attr as object).constructor, Predications)) {
      return [attr];
    } else if (isPlainObject(attr)) {
      return Object.entries(attr).flatMap(([table, columns]) => {
        table = String(table);
        return kernelArray(columns).map((column) =>
          this.predicateBuilder.resolveArelAttribute(table, String(column)),
        );
      });
    } else {
      attr = String(attr);
      const dot = (attr as string).indexOf(".");
      if (dot !== -1) {
        const table = (attr as string).slice(0, dot);
        const column = (attr as string).slice(dot + 1);
        return [this.predicateBuilder.resolveArelAttribute(table, column)];
      } else {
        return [attr];
      }
    }
  });
}

/** @internal */
export const QueryMethodsPublicInstanceMethods = {
  includes,
  all,
  eagerLoad,
  preload,
  extractAssociated,
  references,
  with: withCte,
  withRecursive,
  joins,
  leftOuterJoins,
  leftJoins,
  arel,
  includesBang,
  eagerLoadBang,
  preloadBang,
  referencesBang,
  withBang,
  withRecursiveBang,
  select,
  reselect,
  reselectBang,
  _selectBang,
  group,
  groupBang,
  regroup,
  regroupBang,
  order,
  orderBang,
  inOrderOf,
  reorder,
  reorderBang,
  unscope,
  unscopeBang,
  joinsBang,
  leftOuterJoinsBang,
  where,
  whereBang,
  rewhere,
  invertWhere,
  invertWhereBang,
  structurallyCompatible,
  and,
  andBang,
  or,
  orBang,
  having,
  havingBang,
  limit,
  limitBang,
  offset,
  offsetBang,
  lock,
  lockBang,
  none,
  noneBang,
  isNullRelation,
  readonly,
  readonlyBang,
  strictLoading,
  strictLoadingBang,
  createWith,
  createWithBang,
  from,
  fromBang,
  distinct,
  distinctBang,
  extending,
  extendingBang,
  optimizerHints,
  optimizerHintsBang,
  reverseOrder,
  reverseOrderBang,
  skipQueryCacheBang,
  skipPreloadingBang,
  annotate,
  annotateBang,
  uniqBang,
  excluding,
  without,
  excludingBang,
  constructJoinDependency,
} as const;

/** @internal */
export const QueryMethodsProtectedInstanceMethods = {
  buildSubquery,
  buildWhereClause,
  buildHavingClause: buildWhereClause,
  asyncBang,
  arelColumns,
} as const;

/** @internal */
export const QueryMethodsPrivateInstanceMethods = {
  async,
  buildNamedBoundSqlLiteral,
  buildBoundSqlLiteral,
  lookupTableKlassFromJoinDependencies,
  eachJoinDependencies,
  buildJoinDependencies,
  assertModifiableBang,
  buildArel,
  buildCastValue,
  buildFrom,
  selectNamedJoins,
  selectAssociationList,
  buildJoinBuckets,
  buildJoins,
  buildSelect,
  buildWith,
  buildWithValueFromHash,
  buildWithExpressionFromValue,
  buildWithJoinNode,
  arelColumnsFromHash,
  arelColumnWithTable,
  arelColumn,
  isTableNameMatches,
  reverseSqlOrder,
  isDoesNotSupportReverse,
  buildOrder,
  validateOrderArgs,
  flattenedArgs,
  preprocessOrderArgs,
  sanitizeOrderArguments,
  columnReferences,
  extractTableNameFrom,
  orderColumn,
  buildCaseForValuePosition,
  resolveArelAttributes,
  checkIfMethodHasArgumentsBang,
  processSelectArgs,
  arelColumnAliasesFromHash,
  processWithArgs,
  structurallyIncompatibleValuesFor,
} as const;

export const QueryMethods = defineModule(
  QueryMethodsPublicInstanceMethods,
  QueryMethodsProtectedInstanceMethods,
  QueryMethodsPrivateInstanceMethods,
);

Object.defineProperty(QueryMethods, included, {
  value(): void {
    for (const name of ActiveRecord.Relation.VALUE_METHODS) {
      let methodName: string;
      let defaultValue: () => unknown;
      if ((ActiveRecord.Relation.MULTI_VALUE_METHODS as readonly string[]).includes(name)) {
        methodName = `${name}Values`;
        defaultValue = () => FROZEN_EMPTY_ARRAY;
      } else if ((ActiveRecord.Relation.SINGLE_VALUE_METHODS as readonly string[]).includes(name)) {
        methodName = `${name}Value`;
        defaultValue = name === "createWith" ? () => FROZEN_EMPTY_HASH : () => null;
      } else {
        methodName = `${name}Clause`;
        defaultValue = name === "from" ? () => FromClause.empty() : () => WhereClause.empty();
      }

      Object.defineProperty(ActiveRecord.Relation.prototype, methodName, {
        configurable: true,
        get(this: QueryMethodsHost): unknown {
          return fetch(this._values, name, defaultValue());
        },
        set(this: QueryMethodsHost, value: unknown) {
          assertModifiableBang.call(this);
          this._values[name] = value;
        },
      });
    }

    Object.defineProperty(ActiveRecord.Relation.prototype, "extensions", {
      configurable: true,
      get(this: QueryMethodsHost) {
        return this.extendingValues;
      },
    });
  },
});

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** @internal */
export function isTableNameMatches(this: QueryMethodsHost, from: unknown): boolean {
  const tableName = escapeRegex(this.table.name as string);
  const quotedTableName = escapeRegex(
    this.model.adapterClass().quoteTableName(this.table.name as string),
  );
  return new RegExp(`(?:^|(?<!FROM)\\s)(?:\\b${tableName}\\b|${quotedTableName})(?!\\.)`, "i").test(
    rbObjAsString(from),
  );
}

/** @internal */
export function arelColumn(
  this: QueryMethodsHost,
  field: string | number | ArelNode | null,
  fallback?: (attr: string) => unknown,
): unknown {
  const modelClass: any = this.model;
  const isSymbol = isRubySymbol(field);
  if (isSymbol) field = symbolToName(field as string);

  field = (modelClass.attributeAliases[field as string] as string | undefined) || toS(field);

  const fromClause = (this as any).fromClause;
  const from = fromClause?.name || fromClause?.value;

  if (
    hasKey(modelClass?.columnsHash?.() ?? {}, field) &&
    (!from || isTableNameMatches.call(this, from))
  ) {
    const table: any = this.table;
    return table.get(field);
  }
  const dotMatch = field.match(/^(?<table>(?:\w+\.)?\w+)\.(?<column>\w+)$/);
  if (dotMatch) {
    return arelColumnWithTable.call(this, dotMatch.groups!.table, dotMatch.groups!.column);
  }
  if (fallback) return fallback(field);
  if (Arel.arelNode(field)) return field;
  const quoted = isSymbol ? modelClass.adapterClass().quoteTableName(field) : field;
  return Arel.sql(quoted);
}

/** @internal */
export function arelColumns(this: QueryMethodsHost, columns: unknown[]): unknown[] {
  return columns.flatMap((field) => {
    if (typeof field === "string" || field instanceof Nodes.SqlLiteral) {
      return arelColumn.call(this, String(field));
    } else if (typeof field === "function") {
      return field();
    } else if (isPlainObject(field)) {
      return arelColumnsFromHash.call(this, field);
    } else {
      return field;
    }
  });
}

/** @internal */
export function arelColumnWithTable(
  this: QueryMethodsHost,
  tableName: string,
  columnName: string,
): Arel.Attribute | Nodes.SqlLiteral {
  (this as any).referencesValues = unionReferences((this as any).referencesValues ?? [], [
    Arel.sql(tableName, { retryable: true }),
  ]);
  if (isRubySymbol(columnName) || !/\W/.test(columnName)) {
    return this.predicateBuilder.resolveArelAttribute(tableName, columnName, (name: string) =>
      lookupTableKlassFromJoinDependencies.call(this, name),
    );
  } else {
    return Arel.sql(`${this.model.adapterClass().quoteTableName(tableName)}.${columnName}`);
  }
}

/** @internal */
export function arelColumnsFromHash(
  this: QueryMethodsHost,
  fields: Record<string, unknown>,
): unknown[] {
  return Object.keys(fields).flatMap((key) => {
    const columns = fields[key];
    const tbl = isRubySymbol(key) ? symbolToName(key) : key;
    if (typeof columns === "string") {
      return [arelColumnWithTable.call(this, tbl, columns)];
    }
    if (Array.isArray(columns)) {
      return columns.map((col) => arelColumnWithTable.call(this, tbl, col));
    }
    throw new TypeError(`Expected Symbol, String or Array, got: ${rbObjClassname(columns)}`);
  });
}

/** @internal */
export function orderColumn(this: QueryMethodsHost, field: string): unknown {
  return arelColumn.call(this, field, (attrName: string) => {
    if (attrName === "count" && !isEmpty(this.groupValues)) {
      return this.table.get(attrName);
    } else {
      return Arel.sql(this.model.adapterClass().quoteTableName(attrName), {
        retryable: true,
      });
    }
  });
}

/** @internal */
export function processSelectArgs(this: QueryMethodsHost, fields: unknown[]): unknown[] {
  return fields.flatMap((field) => {
    if (isPlainObject(field)) return arelColumnAliasesFromHash.call(this, field);
    return [field];
  });
}

/** @internal */
export function arelColumnAliasesFromHash(
  this: QueryMethodsHost,
  fields: Record<string, unknown>,
): unknown[] {
  return Object.entries(fields).flatMap<unknown>(([key, columnsAliases]) => {
    const tableName = isSymbol(key) ? symbolToS(key) : key;
    if (isPlainObject(columnsAliases)) {
      return Object.entries(columnsAliases).map(([column, columnAlias]) =>
        arelColumnWithTable
          .call(this, tableName, column)
          .as(this.model.adapterClass().quoteColumnName(toS(columnAlias))),
      );
    } else if (Array.isArray(columnsAliases)) {
      return columnsAliases.map((column) => arelColumnWithTable.call(this, tableName, column));
    } else if (typeof columnsAliases === "string") {
      return (arelColumn.call(this, key) as Arel.Attribute | Nodes.SqlLiteral).as(
        this.model.adapterClass().quoteColumnName(toS(columnsAliases)),
      );
    } else {
      return null;
    }
  });
}

/**
 * @internal
 * @inventedArm if — CONVERGEABLE build-from-applies-join-dependency-synchronously
 * @inventedArm try — CONVERGEABLE build-from-applies-join-dependency-synchronously
 * @inventedArm throw — CONVERGEABLE build-from-applies-join-dependency-synchronously
 */
export function buildFrom(this: QueryMethodsHost): unknown {
  const fromClause = (this as any).fromClause;
  const opts = fromClause?.value;
  let name = fromClause?.name;
  if (opts && typeof opts.arel === "function") {
    name ??= "subquery";
    const alias = String(name);
    let resolved: any = opts;
    if (opts.isEagerLoading === true && typeof opts.applyJoinDependency === "function") {
      const pending = opts.applyJoinDependency({}, (relation: any) => {
        resolved = relation;
      });
      if (resolved === opts) {
        pending.catch(() => {});
        // @nie disposition=TODO
        throw new NotImplementedError(
          "Using an eager-loaded relation with a limit/offset over a collection " +
            "association as a `from` subquery is not supported: Rails resolves this " +
            "by executing a query to materialize the limited primary keys " +
            "(distinct_relation_for_primary_key), which the synchronous `from` " +
            "cannot do. Materialize the ids first, e.g. " +
            "where(id: await rel.pluck(primaryKey)).",
        );
      }
    }
    return resolved.arel().as(alias);
  }
  return opts;
}

/** @internal */
export function buildSelect(this: QueryMethodsHost, arel: any): void {
  if (any(this.selectValues)) {
    arel.project(...arelColumns.call(this, this.selectValues));
  } else if (any(this.model.ignoredColumns) || this.model.enumerateColumnsInSelectStatements) {
    arel.project(...this.model.columnNames().map((field: string) => this.table.get(field)));
  } else {
    arel.project(this.table.get(Arel.star()));
  }
}

/** @internal */
export function buildWithExpressionFromValue(
  this: QueryMethodsHost,
  value: unknown,
  nested = false,
): unknown {
  if (value instanceof Nodes.SqlLiteral) return new Nodes.Grouping(value as any);
  if (value !== null && typeof value === "object" && "arel" in value) {
    if (nested) {
      return (value as any).arel().ast;
    } else {
      return (value as any).arel();
    }
  }
  if (value instanceof SelectManager) return value;
  if (Array.isArray(value)) {
    if (value.length === 1) return buildWithExpressionFromValue.call(this, value[0], false);

    const parts = value.map((query) => buildWithExpressionFromValue.call(this, query, true));
    return parts
      .slice(1)
      .reduce(
        (result: unknown, value: unknown) => new Nodes.UnionAll(result as any, value as any),
        parts[0],
      );
  }
  throw new ArgumentError(
    `Unsupported argument type: \`${String(value)}\` ${rubyClassNameOf(value)}`,
  );
}

/** @internal */
export function buildWithValueFromHash(
  this: QueryMethodsHost,
  hash: Record<string, unknown>,
): Nodes.TableAlias[] {
  return Object.entries(hash).map(
    ([name, value]) =>
      new Nodes.TableAlias(buildWithExpressionFromValue.call(this, value) as any, name),
  );
}

/** @internal */
export function lookupTableKlassFromJoinDependencies(
  this: QueryMethodsHost,
  tableName: string,
): unknown {
  let found: unknown = null;
  eachJoinDependencies.call(this, undefined, (join: any) => {
    if (tableName === join.tableName) found = join.baseKlass;
  });
  return found;
}

/** @internal */
export function eachJoinDependencies(
  this: QueryMethodsHost,
  joinDependencies: JoinDependency[] = buildJoinDependencies.call(this),
  block: (join: any) => void,
): void {
  for (const joinDependency of joinDependencies) {
    joinDependency.each(block);
  }
}

/** @internal */
export function buildJoinDependencies(this: QueryMethodsHost): JoinDependency[] {
  let joins = union(this.joinsValues as AssociationSpec[], this.leftOuterJoinsValues);
  if (!isEmpty(this.eagerLoadValues)) joins = union(joins, this.eagerLoadValues);
  if (!isEmpty(this.includesValues)) joins = union(joins, this.includesValues);

  const joinDependencies: JoinDependency[] = [];
  joinDependencies.unshift(
    constructJoinDependency.call(
      this,
      selectNamedJoins.call(this, joins, joinDependencies) as AssociationSpec[],
      null,
    ),
  );
  return joinDependencies;
}

/** @internal */
export function buildArel(
  this: QueryMethodsHost,
  connection: AbstractAdapter,
  aliases?: AliasTracker,
): any {
  const table: any = this.table;
  const arel = new SelectManager(table);

  buildJoins.call(this, arel.joinSources(), aliases);

  if (!this.whereClause.isEmpty()) arel.where(this.whereClause.ast);
  if (!this.havingClause.isEmpty()) arel.having(this.havingClause.ast);

  if (this.limitValue !== null)
    arel.take(buildCastValue("LIMIT", connection.sanitizeLimit(this.limitValue)));
  if (this.offsetValue !== null) arel.skip(buildCastValue("OFFSET", toI(this.offsetValue)));

  if (this.groupValues.length > 0)
    arel.group(...(arelColumns.call(this, uniq(this.groupValues)) as (ArelNode | string)[]));

  buildOrder.call(this, arel);
  buildWith.call(this, arel);
  buildSelect.call(this, arel);

  if (this.optimizerHintsValues.length > 0) arel.optimizerHints?.(...this.optimizerHintsValues);
  arel.distinct(this.distinctValue);

  if (!this.fromClause.isEmpty()) arel.from(buildFrom.call(this) as any);

  if (this.lockValue != null && this.lockValue !== false) arel.lock(this.lockValue);

  if (this.annotateValues.length > 0) {
    const annotates =
      this.annotateValues.length > 1 ? uniq(this.annotateValues) : this.annotateValues;
    arel.comment?.(...annotates);
  }

  return arel;
}

/** @internal */
export function selectNamedJoins(
  this: QueryMethodsHost,
  joinNames: unknown[],
  stashedJoins: unknown[] | null = null,
  block?: (join: unknown) => void,
): unknown[] {
  const [cteJoins, associations] = partition(
    joinNames,
    (joinName) =>
      isRubySymbol(joinName) &&
      any(this.withValues, (cte) => joinName in cte || symbolToName(joinName) in cte),
  ) as [string[], unknown[]];

  for (const cteName of cteJoins) {
    block?.(new CTEJoin(cteName));
  }

  return selectAssociationList.call(this, associations, stashedJoins, block);
}

/** @internal */
export function selectAssociationList(
  this: QueryMethodsHost,
  associations: unknown[],
  stashedJoins: unknown[] | null = null,
  block?: (join: unknown) => void,
): unknown[] {
  const result: unknown[] = [];
  for (const association of associations) {
    if (Array.isArray(association) || isPlainObject(association) || isRubySymbol(association)) {
      result.push(association);
    } else if (association instanceof ActiveRecord.Associations.JoinDependency) {
      stashedJoins?.push(association);
    } else {
      block?.(association);
    }
  }
  return result;
}

/**
 * @internal
 * @missingRailsName strip — PERMANENT
 */
export function buildJoinBuckets(
  this: QueryMethodsHost,
): [Hash<string, unknown[]>, typeof Nodes.InnerJoin | typeof Nodes.OuterJoin] {
  const buckets = new Hash<string, unknown[]>((h, k) => {
    const v: unknown[] = [];
    h.set(k, v);
    return v;
  });

  let stashedLeftJoins: JoinDependency[] | undefined;
  if (!isEmpty(this.leftOuterJoinsValues)) {
    stashedLeftJoins = [];
    const leftJoins = selectNamedJoins.call(
      this,
      this.leftOuterJoinsValues,
      stashedLeftJoins,
      (leftJoin) => {
        if (leftJoin instanceof CTEJoin) {
          buckets
            .get("join_node")!
            .push(buildWithJoinNode.call(this, leftJoin.name, Nodes.OuterJoin));
        } else {
          throw new ArgumentError("only Hash, Symbol and Array are allowed");
        }
      },
    );

    if (isEmpty(this.joinsValues)) {
      buckets.set("named_join", leftJoins);
      buckets.set("stashed_join", stashedLeftJoins);
      return [buckets, Nodes.OuterJoin];
    } else {
      stashedLeftJoins.unshift(
        constructJoinDependency.call(this, leftJoins as AssociationSpec[], Nodes.OuterJoin),
      );
    }
  }

  const joins = [...this.joinsValues];
  let stashedEagerLoad: JoinDependency | undefined;
  if (joins[joins.length - 1] instanceof ActiveRecord.Associations.JoinDependency) {
    if ((joins[joins.length - 1] as JoinDependency).baseKlass === this.model) {
      stashedEagerLoad = joins.pop() as JoinDependency;
    }
  }

  for (const [i, join] of joins.entries()) {
    if (typeof join === "string" && !join.startsWith(":")) {
      joins[i] = new Nodes.StringJoin(Arel.sql(join.trim()) as any) as Nodes.Join;
    }
  }

  while (joins[0] instanceof Nodes.Join) {
    const joinNode = joins.shift() as Nodes.Join;
    if (!(joinNode instanceof Nodes.LeadingJoin) && (stashedEagerLoad || stashedLeftJoins)) {
      buckets.get("join_node")!.push(joinNode);
    } else {
      buckets.get("leading_join")!.push(joinNode);
    }
  }

  buckets.set(
    "named_join",
    selectNamedJoins.call(this, joins, buckets.get("stashed_join")!, (join) => {
      if (join instanceof Nodes.Join) {
        buckets.get("join_node")!.push(join);
      } else if (join instanceof CTEJoin) {
        buckets.get("join_node")!.push(buildWithJoinNode.call(this, join.name));
      } else {
        throw new RuntimeError(`unknown class: ${rbObjClassname(join)}`);
      }
    }),
  );

  if (stashedLeftJoins) buckets.get("stashed_join")!.push(...stashedLeftJoins);
  if (stashedEagerLoad) buckets.get("stashed_join")!.push(stashedEagerLoad);

  return [buckets, Nodes.InnerJoin];
}

/** @internal */
export function buildJoins(
  this: QueryMethodsHost,
  joinSources: any[],
  aliases?: AliasTracker,
): any[] {
  if (isEmpty(this.joinsValues) && isEmpty(this.leftOuterJoinsValues)) return joinSources;

  const [buckets, joinType] = buildJoinBuckets.call(this);

  const namedJoins = buckets.get("named_join")! as AssociationSpec[];
  const stashedJoins = buckets.get("stashed_join")! as JoinDependency[];
  const leadingJoins = buckets.get("leading_join")! as Nodes.Join[];
  const joinNodes = buckets.get("join_node")! as Nodes.Join[];

  if (!isEmpty(leadingJoins)) joinSources.push(...leadingJoins);

  if (!(isEmpty(namedJoins) && isEmpty(stashedJoins))) {
    const aliasTracker = this.aliasTracker([...leadingJoins, ...joinNodes], aliases?.aliases);
    const joinDependency = constructJoinDependency.call(this, namedJoins, joinType);
    joinSources.push(
      ...joinDependency.joinConstraints(stashedJoins, aliasTracker, this.referencesValues),
    );
  }

  if (!isEmpty(joinNodes)) joinSources.push(...joinNodes);
  return joinSources;
}

/** @internal */
export function buildWith(this: QueryMethodsHost, arel: SelectManager): SelectManager | undefined {
  if (isEmpty(this.withValues)) return;

  const withStatements = this.withValues.map((withValue) =>
    buildWithValueFromHash.call(this, withValue),
  );

  return this._withIsRecursive
    ? arel.with(":recursive", withStatements)
    : arel.with(withStatements);
}

/** @internal */
export function buildWithJoinNode(
  this: QueryMethodsHost,
  name: string,
  kind: typeof Nodes.InnerJoin | typeof Nodes.OuterJoin = Nodes.InnerJoin,
): unknown {
  const withTable = new ArelTable(name);

  return first(
    this.table
      .join(withTable, kind)
      .on(
        withTable
          .get(foreignKey(String(this.model.modelName)))
          .eq(this.table.get(this.model.primaryKey as string)),
      )
      .joinSources(),
  );
}
