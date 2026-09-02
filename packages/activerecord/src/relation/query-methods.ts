import { hasKey } from "@blazetrails/ruby-compat";
import * as Arel from "@blazetrails/arel";
import { Nodes, SelectManager, Table as ArelTable } from "@blazetrails/arel";
import {
  ArgumentError,
  Attribute,
  ValueType,
  sanitizeForMassAssignment as sanitizeForbiddenAttributes,
} from "@blazetrails/activemodel";
import { PredicateBuilder } from "./predicate-builder.js";
import { DeferredIdsNotIn } from "./predicate-builder/deferred-distinct-pk-in.js";
import { isBaseInstance } from "./predicate-builder/is-base-instance.js";
import {
  ActiveRecordError,
  IrreversibleOrderError,
  NotImplementedError,
  PreparedStatementInvalid,
  UnmodifiableRelation,
} from "../errors.js";
import type { AbstractAdapter } from "../connection-adapters/abstract-adapter.js";
import { FromClause } from "./from-clause.js";
import { Map as TypeCasterMap } from "../type-caster/map.js";
import { WhereClause } from "./where-clause.js";
import { JoinDependency } from "../associations/join-dependency.js";
import type { AliasCounts, AliasTracker } from "../associations/alias-tracker.js";
import { threadedConnectionFor } from "../connection-handling.js";
import { wrapWithScopeProxy } from "./delegation.js";
import {
  any,
  compactBlank,
  defineModule,
  foreignKey,
  rbEqual,
  rbHash,
  wrap,
} from "@blazetrails/activesupport";

export class WhereChain<R = any> {
  private _scope: R;

  constructor(scope: R) {
    this._scope = scope;
  }

  not(opts: Record<string, unknown>): R;
  not(opts: unknown[]): R;
  not(cols: string[], tuples: unknown[][]): R;
  not(opts: Record<string, unknown> | string[] | unknown[], ...rest: unknown[]): R {
    const scope = this._scope as unknown as QueryMethodsHost;
    if (
      Array.isArray(opts) &&
      rest.length > 0 &&
      opts.every((c) => typeof c === "string") &&
      Array.isArray(rest[0])
    ) {
      const nodes = scope.predicateBuilder.buildComposite(
        opts as string[],
        rest[0] as unknown[][],
        (tableName) =>
          lookupTableKlassFromJoinDependencies.call(scope, tableName) as
            | QueryMethodsHost["_model"]
            | null,
      );
      if (nodes.length > 0) {
        scope.whereClause = scope.whereClause.plus(new WhereClause(nodes).invert());
      }
      return this._scope;
    }
    const whereClause = buildWhereClause.call(scope, opts, rest);
    scope.whereClause = scope.whereClause.plus(whereClause.invert());
    return this._scope;
  }

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
      throw argumentError(
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

/** @noRailsEquivalent PERMANENT */
export function defineValueMethods(relationClass: {
  prototype: object;
  MULTI_VALUE_METHODS: readonly string[];
  SINGLE_VALUE_METHODS: readonly string[];
  CLAUSE_METHODS: readonly string[];
  VALUE_METHODS: readonly string[];
}): void {
  for (const name of relationClass.VALUE_METHODS) {
    let methodName: string;
    let defaultValue: () => unknown;
    if (relationClass.MULTI_VALUE_METHODS.includes(name)) {
      methodName = `${name}Values`;
      defaultValue = () => FROZEN_EMPTY_ARRAY;
    } else if (relationClass.SINGLE_VALUE_METHODS.includes(name)) {
      methodName = `${name}Value`;
      defaultValue = name === "createWith" ? () => FROZEN_EMPTY_HASH : () => null;
    } else {
      methodName = `${name}Clause`;
      defaultValue = name === "from" ? () => FromClause.empty() : () => WhereClause.empty();
    }

    Object.defineProperty(relationClass.prototype, methodName, {
      configurable: true,
      get(this: QueryMethodsHost): unknown {
        const values = this._values;
        return name in values ? values[name] : defaultValue();
      },
      set(this: QueryMethodsHost, value: unknown) {
        assertModifiableBang.call(this);
        this._values[name] = value;
      },
    });
  }

  Object.defineProperty(relationClass.prototype, "extensions", {
    configurable: true,
    get(this: QueryMethodsHost) {
      return this.extendingValues;
    },
  });
}

type OrderDirection = "asc" | "desc" | "ASC" | "DESC";

export type OrderArg =
  | string
  | Record<string, OrderDirection | Record<string, OrderDirection>>
  | Nodes.Node
  | string[]
  | [Nodes.Node, ...unknown[]]
  | Map<Nodes.Node | string, OrderDirection>
  | null;

interface QueryMethodsHost {
  primaryKey: string | string[];
  _values: Record<string, unknown>;
  whereClause: WhereClause;
  havingClause: WhereClause;
  fromClause: FromClause;
  includesValues: AssociationSpec[];
  eagerLoadValues: AssociationSpec[];
  preloadValues: AssociationSpec[];
  selectValues: any[];
  groupValues: Array<string | Nodes.Node>;
  orderValues: Array<string | Nodes.Node>;
  joinsValues: (AssociationSpec | string | Nodes.Join)[];
  leftOuterJoinsValues: AssociationSpec[];
  referencesValues: Array<string | Nodes.SqlLiteral>;
  extendingValues: Array<Record<string, (...args: any[]) => any>>;
  unscopeValues: Array<string | { where: string | string[] }>;
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
  aliasTracker(joins?: Nodes.Node[], aliases?: AliasCounts): AliasTracker;
  clone(): any;
  spawn(): any;
  /** @internal */
  buildArel(connection: unknown, aliases?: AliasTracker): any;
  skipPreloadingValue: boolean;
  _model: typeof import("../base.js").Base;
  model: QueryMethodsHost["_model"];
  table: ArelTable;
  predicateBuilder: import("./predicate-builder.js").PredicateBuilder;
}

function unionAppend<T>(target: readonly T[], incoming: readonly T[]): T[] {
  const union = [...target];
  for (const spec of incoming) {
    if (!union.some((seen) => structuralUnionEq(seen, spec))) union.push(spec);
  }
  return union;
}

function includes(this: QueryMethodsHost, ...args: AssociationSpec[]): any {
  checkIfMethodHasArgumentsBang.call(this, ":includes", args);
  return includesBang.apply(this.spawn(), args);
}

function includesBang(this: QueryMethodsHost, ...args: AssociationSpec[]): any {
  this.includesValues = unionAppend(this.includesValues, args);
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
  this.eagerLoadValues = unionAppend(this.eagerLoadValues, args);
  return this;
}

function preload(this: QueryMethodsHost, ...args: AssociationSpec[]): any {
  checkIfMethodHasArgumentsBang.call(this, ":preload", args);
  return preloadBang.apply(this.spawn(), args);
}

function preloadBang(this: QueryMethodsHost, ...args: AssociationSpec[]): any {
  this.preloadValues = unionAppend(this.preloadValues, args);
  return this;
}

async function extractAssociated(this: QueryMethodsHost, association: string): Promise<any[]> {
  const records = await preload.call(this, association);
  return Promise.all(records.map((record: any) => record[association]()));
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
  return reference instanceof Nodes.SqlLiteral ? reference.value : reference;
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

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE inline-ruby-bodies-extracted-as-named-helpers
 */
export function referencesFromConditions(conditions: unknown): Nodes.SqlLiteral[] {
  if (!isPlainObject(conditions)) return [];
  return PredicateBuilder.references(conditions);
}

function withCte(this: QueryMethodsHost, ...args: any[]): any {
  if (args.some((cte) => typeof cte === "function")) {
    throw argumentError("ActiveRecord::Relation#with does not accept a block");
  }
  checkIfMethodHasArgumentsBang.call(this, ":with", args);
  return withBang.apply(this.spawn(), args);
}

function withBang(this: QueryMethodsHost, ...args: unknown[]): any {
  const processed = processWithArgs.call(this, args);
  this.withValues = unionAppend(this.withValues, processed);
  return this;
}

function withRecursive(this: QueryMethodsHost, ...args: any[]): any {
  checkIfMethodHasArgumentsBang.call(this, ":with_recursive", args);
  return withRecursiveBang.apply(this.spawn(), args);
}

function withRecursiveBang(this: QueryMethodsHost, ...args: unknown[]): any {
  const processed = processWithArgs.call(this, args);
  this.withValues = unionAppend(this.withValues, processed);
  this._withIsRecursive = true;
  return this;
}

function select(this: QueryMethodsHost, ...fields: any[]): any {
  if (fields.length >= 1 && typeof fields[fields.length - 1] === "function") {
    if (fields.length > 1) {
      throw new ArgumentError("`select' with block doesn't take arguments.");
    }
    return (this as any).toArray().then((records: any[]) => records.filter(fields[0]));
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
  this.selectValues = args.map((c: any) => {
    if (c instanceof Nodes.Node) return c;
    if (typeof c === "object" && c !== null && "value" in c)
      return new Nodes.SqlLiteral((c as { value: string }).value);
    return String(c);
  });
  return this;
}

function _selectBang(this: QueryMethodsHost, ...fields: any[]): any {
  const flat = fields.flat(Infinity);
  const normalized = flat.map((c: any) => {
    if (c instanceof Nodes.Node) return c;
    if (typeof c === "function") return c;
    if (typeof c === "object" && c !== null && "value" in c)
      return new Nodes.SqlLiteral((c as { value: string }).value);
    return String(c);
  });
  const seenStrings = new Set<string>();
  const seenNodeHashes = new Map<number, Nodes.Node[]>();
  const nodeIsDuplicate = (node: Nodes.Node): boolean => {
    const h = rbHash(node);
    const bucket = seenNodeHashes.get(h);
    if (!bucket) return false;
    return bucket.some((n) => rbEqual(n, node));
  };
  const addNodeToSeen = (node: Nodes.Node): void => {
    const h = rbHash(node);
    const bucket = seenNodeHashes.get(h);
    if (bucket) bucket.push(node);
    else seenNodeHashes.set(h, [node]);
  };
  const seenThunks = new Set<unknown>();
  for (const existing of this.selectValues) {
    if (typeof existing === "string") seenStrings.add(existing);
    else if (existing instanceof Nodes.Node) addNodeToSeen(existing);
    else if (typeof existing === "function") seenThunks.add(existing);
    else seenStrings.add((existing as { value: string }).value);
  }
  for (const col of normalized) {
    if (typeof col === "string") {
      if (!seenStrings.has(col)) {
        this.selectValues = [...this.selectValues, col];
        seenStrings.add(col);
      }
    } else if (col instanceof Nodes.Node) {
      if (!nodeIsDuplicate(col)) {
        this.selectValues = [...this.selectValues, col];
        addNodeToSeen(col);
      }
    } else if (typeof col === "function") {
      if (!seenThunks.has(col)) {
        this.selectValues = [...this.selectValues, col];
        seenThunks.add(col);
      }
    } else {
      const key = (col as { value: string }).value;
      if (!seenStrings.has(key)) {
        this.selectValues = [...this.selectValues, col];
        seenStrings.add(key);
      }
    }
  }
  return this;
}

function group(this: QueryMethodsHost, ...args: (string | Nodes.Node)[]): any {
  checkIfMethodHasArgumentsBang.call(this, ":group", args as unknown[]);
  return groupBang.apply(this.spawn(), args);
}

function groupBang(
  this: QueryMethodsHost,
  ...args: (string | import("@blazetrails/arel").Nodes.Node)[]
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
  ...args: (string | import("@blazetrails/arel").Nodes.Node)[]
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
  this.orderValues = dedupeOrderClauses([
    ...this.orderValues,
    ...(args as unknown[]),
  ]) as typeof this.orderValues;
  return this;
}

function inOrderOf(
  this: QueryMethodsHost,
  column: string | Nodes.Node,
  values: unknown[],
  filter = true,
): any {
  (this.model as any).disallowRawSqlBang([column], {
    permit: (
      this.model.adapterClassSync() as unknown as { columnNameWithOrderMatcher(): RegExp }
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
  this.reorderingValue = true;
  this.orderValues = dedupeOrderClauses(args as unknown[]) as typeof this.orderValues;
  return this;
}
let orderClauseIdentity = 0;
const orderClauseIdentities = new WeakMap<object, number>();

function orderClauseKey(clause: unknown): string {
  if (typeof clause === "string") return `s:${clause}`;
  if (clause instanceof Nodes.SqlLiteral) return `s:${String((clause as any).value ?? "")}`;
  if (clause instanceof Nodes.Attribute) {
    return `a:${String((clause as any).relation?.name)}.${(clause as any).name}`;
  }
  if (clause instanceof Nodes.Node && "expr" in (clause as any)) {
    return `${clause.constructor.name}(${orderClauseKey((clause as any).expr)})`;
  }
  if (clause !== null && typeof clause === "object") {
    let id = orderClauseIdentities.get(clause);
    if (id === undefined) {
      id = ++orderClauseIdentity;
      orderClauseIdentities.set(clause, id);
    }
    return `o:${id}`;
  }
  return `v:${String(clause)}`;
}

function dedupeOrderClauses<T>(clauses: T[]): T[] {
  const seen = new Set<string>();
  return clauses.filter((c) => {
    const key = orderClauseKey(c);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export function setValues(host: QueryMethodsHost, values: Record<string, unknown>): void {
  host._values = values;
}

function unscope(
  this: QueryMethodsHost,
  ...args: Array<UnscopeType | { where: string | string[] }>
): any {
  checkIfMethodHasArgumentsBang.call(this, ":unscope", args as unknown[]);
  return unscopeBang.apply(this.spawn(), args as any);
}

function unscopeBang(
  this: QueryMethodsHost,
  ...args: Array<string | { where: string | string[] }>
): any {
  this.unscopeValues = [...this.unscopeValues, ...args];
  for (const rawScope of args) {
    if (typeof rawScope === "string") {
      const scope = rawScope === "leftJoins" ? "leftOuterJoins" : rawScope;
      if (!VALID_UNSCOPING_VALUES.has(scope as UnscopeType)) {
        throw argumentError(
          `Called unscope() with invalid unscoping argument ':${scope}'. Valid arguments are :${[...VALID_UNSCOPING_VALUES].join(", :")}.`,
        );
      }
      delete this._values[scope as UnscopeType];
    } else if (rawScope && typeof rawScope === "object") {
      for (const [key, target] of Object.entries(rawScope)) {
        if (key !== "where") {
          throw argumentError(
            `Object arguments to unscope() must use "where" as the key, e.g. unscope({ where: "column_name" }).`,
          );
        }
        const targets = Array.isArray(target) ? target : [target];
        this.whereClause = this.whereClause.except(...targets);
      }
    } else {
      throw argumentError(
        `Unrecognized scoping: ${JSON.stringify(rawScope)}. Use unscope({ where: "column_name" }) or one of: ${[...VALID_UNSCOPING_VALUES].join(", ")}.`,
      );
    }
  }
  return this;
}

function joins(this: QueryMethodsHost, ...args: JoinSpec[]): any {
  checkIfMethodHasArgumentsBang.call(this, ":joins", args as unknown[]);
  return joinsBang.apply(this.spawn(), args as (string | Nodes.Join)[]);
}

function joinsBang(this: QueryMethodsHost, ...args: (string | Nodes.Join)[]): any {
  for (const arg of args) {
    if (!this.joinsValues.some((seen) => structuralUnionEq(seen, arg)))
      this.joinsValues = [...this.joinsValues, arg];
  }
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
  for (const arg of args) {
    if (!this.leftOuterJoinsValues.some((seen) => structuralUnionEq(seen, arg)))
      this.leftOuterJoinsValues = [...this.leftOuterJoinsValues, arg];
  }
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
    const [head, ...tail] = opts as unknown[];
    return buildWhereClause.call(this, head, tail);
  }

  let parts: (Nodes.Node | string)[];
  if (typeof opts === "string") {
    if (rest.length === 0) {
      parts = [Arel.sql(opts)];
    } else if (isPlainObject(rest[0]) && /:\w+/.test(opts)) {
      parts = [buildNamedBoundSqlLiteral.call(this, opts, rest[0])];
    } else if (opts.includes("?")) {
      parts = [buildBoundSqlLiteral.call(this, opts, rest)];
    } else {
      parts = [this.model.sanitizeSql(rest.length === 0 ? opts : [opts, ...rest])!];
    }
  } else if (isPlainObject(opts)) {
    const mc = this.model;
    const aliases: Record<string, string> = mc?.attributeAliases ?? {};
    const transformed: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(opts)) {
      const name = isRubySymbol(key) ? symbolToName(key) : key;
      const resolved = aliases[name] ?? name;
      transformed[resolved] = value;
    }
    opts = transformed;
    referencesBang.call(this, ...referencesFromConditions(opts));
    parts = this.predicateBuilder.buildFromHash(
      opts as Record<string, unknown>,
      (tableName: string) => lookupTableKlassFromJoinDependencies.call(this, tableName),
    );
  } else if (opts instanceof Nodes.Node) {
    parts = [opts];
  } else {
    throw argumentError(`Unsupported argument type: ${String(opts)} (${typeof opts})`);
  }

  return new WhereClause(parts);
}

function where(
  this: QueryMethodsHost,
  conditionsOrSql?: Record<string, unknown> | string | Nodes.Node | string[] | unknown[] | null,
  ...rest: unknown[]
): any {
  if (conditionsOrSql === undefined) return new WhereChain(this.spawn());
  if (rest.length === 0 && isBlankArgument(conditionsOrSql)) {
    return this;
  }
  return whereBang.call(
    this.spawn(),
    conditionsOrSql as Record<string, unknown> | string | Nodes.Node | null,
    ...rest,
  );
}

function whereBang(this: QueryMethodsHost, opts: any, ...rest: unknown[]): any {
  if (Array.isArray(opts) && rest.length > 0 && opts.every((c) => typeof c === "string")) {
    if (rest.length !== 1 || !Array.isArray(rest[0])) {
      throw argumentError(
        "Relation#where(cols, tuples): composite-key form requires a tuples argument as an array of arrays",
      );
    }
    const cols = opts;
    const tuples = rest[0] as unknown[][];
    const nodes = this.predicateBuilder.buildComposite(
      cols,
      tuples,
      (tableName) =>
        lookupTableKlassFromJoinDependencies.call(this, tableName) as
          | QueryMethodsHost["_model"]
          | null,
    );
    if (nodes.length === 0) return noneBang.call(this);
    this.whereClause = this.whereClause.plus(new WhereClause([...nodes]));
    return this;
  }
  const clause = buildWhereClause.call(this, opts, rest);
  this.whereClause = this.whereClause.plus(clause);
  return this;
}

function rewhere(this: QueryMethodsHost, conditions: Record<string, unknown> | null): any {
  if (conditions == null) return unscope.call(this, "where");
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

export function argumentError(message: string): Error {
  const err = new Error(message);
  err.name = "ArgumentError";
  return err;
}

function uniqArray(arr: unknown[]): unknown[] {
  const out: unknown[] = [];
  for (const el of arr) {
    if (!out.some((seen) => deepEqual(seen, el))) out.push(el);
  }
  return out;
}

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export function structuralUnionEq(a: unknown, b: unknown): boolean {
  if (a instanceof JoinDependency || b instanceof JoinDependency) return a === b;
  return deepEqual(a, b);
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
      v1 = uniqArray(v1);
      v2 = uniqArray(v2);
    }
    return !deepEqual(v1, v2);
  });
  return incompat;
}

function isRelationForCombining(value: unknown): value is QueryMethodsHost {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  const wc = v.whereClause as Record<string, unknown> | undefined;
  const hc = v.havingClause as Record<string, unknown> | undefined;
  return (
    typeof wc === "object" &&
    wc !== null &&
    typeof wc.merge === "function" &&
    typeof wc.or === "function" &&
    typeof hc === "object" &&
    hc !== null &&
    typeof hc.merge === "function" &&
    typeof hc.or === "function" &&
    Array.isArray(v.referencesValues)
  );
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
  if (!isRelationForCombining(other)) {
    throw argumentError(
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
    throw argumentError(
      `Relation passed to #${methodName} must be structurally compatible. Incompatible values: [${incompat.map((v) => `:${v}`).join(", ")}]`,
    );
  }
}

export function areStructurallyCompatible(self: unknown, other: unknown): boolean {
  if (!isRelationForCombining(self) || !isRelationForCombining(other)) return false;
  return structurallyIncompatibleValuesFor.call(self, other).length === 0;
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
  opts: string | Record<string, unknown> | Nodes.Node,
  ...rest: unknown[]
): any {
  if (opts == null || isBlankArgument(opts)) return this;
  return havingBang.call(this.spawn(), opts, ...rest);
}

function havingBang(
  this: QueryMethodsHost,
  opts: string | Record<string, unknown> | Nodes.Node,
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

function extending(
  this: QueryMethodsHost,
  modules?: Record<string, (...args: any[]) => any> | ((rel: any) => void),
): any {
  if (!modules) return this;
  return extendingBang.call(this.spawn(), modules);
}

function extendingBang(
  this: QueryMethodsHost,
  ...modules: Array<Record<string, (...args: any[]) => any> | ((rel: any) => void)>
): any {
  for (const mod of modules) {
    if (typeof mod === "function") {
      mod(this);
    } else {
      this.extendingValues = [...this.extendingValues, mod];
      const wrapped = wrapWithScopeProxy(this);
      for (const [name, fn] of Object.entries(mod)) {
        (this as any)[name] = fn.bind(wrapped);
      }
    }
  }
  return this;
}

function optimizerHints(this: QueryMethodsHost, ...args: string[]): any {
  checkIfMethodHasArgumentsBang.call(this, ":optimizer_hints", args);
  return optimizerHintsBang.apply(this.spawn(), args);
}

function optimizerHintsBang(this: QueryMethodsHost, ...args: string[]): any {
  this.optimizerHintsValues = [...new Set([...this.optimizerHintsValues, ...args])];
  return this;
}

function reverseOrder(this: QueryMethodsHost): any {
  return reverseOrderBang.call(this.spawn());
}

function reverseOrderBang(this: QueryMethodsHost): any {
  const clauses = this.orderValues.filter(
    (clause) => clause != null && !(typeof clause === "string" && /^\s*$/.test(clause)),
  );
  if (clauses.length === 0) {
    this.orderValues = reverseSqlOrder.call(this, []) as typeof this.orderValues;
    return this;
  }
  this.orderValues = clauses.map((clause) => {
    if (clause instanceof Nodes.Node) {
      if (clause instanceof Nodes.SqlLiteral) {
        const raw = String((clause as any).value ?? "").trim();
        if (isDoesNotSupportReverse(raw)) {
          throw new IrreversibleOrderError(
            `Order ${JSON.stringify(raw)} cannot be reversed automatically`,
          );
        }
        const flipped = raw
          .split(",")
          .map((term) => {
            const s = term.trim();
            if (/\s+ASC$/i.test(s)) return s.replace(/\s+ASC$/i, " DESC");
            if (/\s+DESC$/i.test(s)) return s.replace(/\s+DESC$/i, " ASC");
            return `${s} DESC`;
          })
          .join(", ");
        return new Nodes.SqlLiteral(flipped);
      }
      if (typeof (clause as any).reverse === "function") return (clause as any).reverse();
      if (typeof (clause as any).desc === "function") return (clause as any).desc();
      return clause;
    }
    const reversed = reverseSqlOrder.call(this, [clause]) as string[];
    return new Nodes.SqlLiteral(reversed.join(", "));
  });
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
    this._values[name] = [...new Set(values)];
  }
  return this;
}

function excludingWithCallee(callee: "excluding" | "without") {
  return function (this: QueryMethodsHost, ...records: unknown[]): any {
    const relations = records.filter((r) => isRelationForCombining(r)) as any[];
    records = records
      .filter((r) => !isRelationForCombining(r))
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
      if (!relation.isLoaded || relation.isScheduled) {
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
  const literalIds = literalRecords.map((r) => (isBaseInstance(r) ? (r as any).id : r));
  const inlineSubquery = (this.predicateBuilder.build(attribute, deferredRelations[0]) as Nodes.In)
    .right as Nodes.Node;
  this.whereClause = this.whereClause.plus(
    new WhereClause([
      new DeferredIdsNotIn(attribute, inlineSubquery, literalIds, deferredRelations),
    ]),
  );
  return this;
}

/** @missingRailsCall with_connection — PERMANENT */
export function arel(this: QueryMethodsHost, aliases?: AliasTracker): any {
  return ((this as any)._arel ??= this.buildArel((this as any)._conn(), aliases));
}

export function constructJoinDependency(
  this: QueryMethodsHost,
  associations: string | AssociationSpec[],
  joinType?: unknown,
): JoinDependency {
  return new JoinDependency(
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
  if ((this as any)._loaded || (this as any)._arel) {
    throw new UnmodifiableRelation();
  }
}

export function isBlankArgument(value: unknown): boolean {
  if (value === null || value === undefined || value === false) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (isPlainObject(value)) return Object.keys(value).length === 0;
  return false;
}

/** @internal */
export function checkIfMethodHasArgumentsBang(
  this: QueryMethodsHost,
  methodName: string,
  args: unknown[],
  message?: string,
  block?: (args: unknown[]) => void,
): void {
  if (!args || args.length === 0) {
    throw argumentError(message ?? `The method .${methodName.slice(1)}() must contain arguments.`);
  } else {
    block?.(args);

    const flat = args.flat(Infinity);
    args.length = 0;
    for (const a of flat) {
      if (!isBlankArgument(a)) args.push(a);
    }
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

const VALID_DIRECTIONS = new Set(["asc", "desc"]);

/** @internal */
export function validateOrderArgs(this: QueryMethodsHost, args: unknown[]): void {
  for (const arg of args) {
    if (arg instanceof Map) {
      for (const [, value] of arg) {
        if (!VALID_DIRECTIONS.has(String(value).toLowerCase())) {
          throw argumentError(
            `Direction "${value}" is invalid. Valid directions are: [:asc, :desc, :ASC, :DESC, "asc", "desc", "ASC", "DESC"]`,
          );
        }
      }
      continue;
    }
    if (!isPlainObject(arg)) continue;
    for (const [, value] of Object.entries(arg)) {
      if (isPlainObject(value)) {
        validateOrderArgs.call(this, [value]);
      } else if (!VALID_DIRECTIONS.has(String(value).toLowerCase())) {
        throw argumentError(
          `Direction "${value}" is invalid. Valid directions are: [:asc, :desc, :ASC, :DESC, "asc", "desc", "ASC", "DESC"]`,
        );
      }
    }
  }
}

/** @internal */
export function processWithArgs(
  this: QueryMethodsHost,
  args: unknown[],
): Record<string, unknown>[] {
  return args.flatMap((arg) => {
    if (!isPlainObject(arg)) {
      const desc =
        arg === null
          ? "null"
          : Array.isArray(arg)
            ? "Array"
            : typeof arg !== "object"
              ? `${String(arg)} (${typeof arg})`
              : ((arg as any).constructor?.name ?? "object");
      throw argumentError(`Unsupported argument type: ${desc}. Expected a plain object/hash.`);
    }
    return Object.entries(arg).map(([k, v]) => ({ [k]: v }));
  });
}

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export function toI(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "number") return Math.trunc(value);
  if (typeof value === "bigint") return Number(value);
  const n = Number.parseInt(String(value), 10);
  return Number.isNaN(n) ? 0 : n;
}

/** @internal */
export function buildCastValue(name: string, value: unknown): Attribute {
  return Attribute.withCastValue(name, value, new ValueType());
}

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE inline-ruby-bodies-extracted-as-named-helpers
 */
export function normalizeBoundValue(this: QueryMethodsHost, value: unknown): unknown {
  if (value instanceof Nodes.Node) {
    return Arel.sql(connectionFor(this._model).toSql(value));
  }
  if (isRelationLike(value)) {
    return Arel.sql((value as { toSql(): string }).toSql());
  }
  if (Array.isArray(value) || value instanceof Set) {
    const mapped = Array.from(value).map((v) => (hasIdForDatabase(v) ? v.idForDatabase : v));
    return mapped.length === 0 ? null : mapped;
  }
  if (hasIdForDatabase(value)) return value.idForDatabase;
  return value;
}

function hasIdForDatabase(value: unknown): value is { idForDatabase: unknown } {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Set) &&
    "idForDatabase" in value
  );
}

/** @internal */
export function buildNamedBoundSqlLiteral(
  this: QueryMethodsHost,
  statement: string,
  values: Record<string, unknown>,
): Nodes.BoundSqlLiteral {
  const namedBinds: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    namedBinds[key] = normalizeBoundValue.call(this, value);
  }
  try {
    return new Nodes.BoundSqlLiteral(`(${statement})`, null, namedBinds);
  } catch (e: any) {
    throw new PreparedStatementInvalid(e?.message ?? String(e), { cause: e });
  }
}

/** @internal */
export function buildBoundSqlLiteral(
  this: QueryMethodsHost,
  statement: string,
  values: unknown[],
): Nodes.BoundSqlLiteral {
  const positionalBinds = values.map((value) => normalizeBoundValue.call(this, value));
  try {
    return new Nodes.BoundSqlLiteral(`(${statement})`, positionalBinds, null);
  } catch (e: any) {
    throw new PreparedStatementInvalid(e?.message ?? String(e), { cause: e });
  }
}

/**
 * @internal
 * @missingRailsCall empty? — PERMANENT
 */
export function buildSubquery(
  this: QueryMethodsHost,
  subqueryAlias: string,
  selectValue: unknown,
): SelectManager {
  const relation =
    typeof (this as any).except === "function" ? (this as any).except("optimizerHints") : this;
  if (typeof relation.arel !== "function") {
    throw new ActiveRecordError("Cannot build subquery: relation does not support arel()");
  }
  const subquery = relation.arel().as(subqueryAlias);
  const sm = new SelectManager(subquery);
  sm.project(selectValue as any);
  const hints: string[] = (this as any).optimizerHintsValues ?? [];
  if (hints.length > 0) sm.optimizerHints(...hints);
  return sm;
}

/**
 * @internal
 * @missingRailsCall new — PERMANENT
 */
export function isDoesNotSupportReverse(order: string): boolean {
  const plain = String(order);
  if (
    plain.includes(",") &&
    plain.split(",").find((section) => section.split("(").length !== section.split(")").length) !==
      undefined
  ) {
    return true;
  }
  return /\bnulls\s+(?:first|last)\b/i.test(plain);
}

/** @internal */
export function reverseSqlOrder(this: QueryMethodsHost, orderQuery: unknown[]): unknown[] {
  if (orderQuery.length === 0) {
    const pk = (this as any)._model?.primaryKey;
    if (pk) {
      const arelTable: any = this.table;
      return [
        arelTable
          ? new Nodes.Descending(arelTable.get(pk))
          : new Nodes.Descending(new Nodes.SqlLiteral(pk)),
      ];
    }
    throw new IrreversibleOrderError(
      "Relation has no current order and table has no primary key to be used as default order",
    );
  }
  return orderQuery.flatMap((o) => {
    if (o instanceof Nodes.Node) {
      if (typeof (o as any).reverse === "function") return [(o as any).reverse()];
      if (typeof (o as any).desc === "function") return [(o as any).desc()];
    }
    if (typeof o === "string") {
      if (isDoesNotSupportReverse(o)) {
        throw new IrreversibleOrderError(
          `Order ${JSON.stringify(o)} cannot be reversed automatically`,
        );
      }
      return o.split(",").map((s) => {
        s = s.trim();
        if (/\sasc$/i.test(s)) return s.replace(/\sasc$/i, " DESC");
        if (/\sdesc$/i.test(s)) return s.replace(/\sdesc$/i, " ASC");
        return `${s} DESC`;
      });
    }
    return [o];
  });
}

/** @internal */
export function extractTableNameFrom(string: string): string | null {
  const match = string.match(/^\W?(\w+)\W?\./);
  return match ? match[1] : null;
}

function isRubySymbol(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(":");
}

function symbolToName(s: string): string {
  const name = s.slice(1);
  if (name.trim() === "") {
    throw argumentError("Order symbols must have a non-blank name");
  }
  return name;
}

/** @internal */
export function columnReferences(orderArgs: unknown[]): Nodes.SqlLiteral[] {
  const refs: string[] = [];
  for (const arg of orderArgs) {
    if (Array.isArray(arg)) {
      refs.push(...columnReferences(arg).map((ref) => ref.value));
    } else if (typeof arg === "string") {
      const term = isRubySymbol(arg) ? symbolToName(arg) : arg;
      const t = extractTableNameFrom(term);
      if (t) refs.push(t);
    } else if (arg instanceof Nodes.Attribute) {
      refs.push(String(arg.relation.name));
    } else if (arg instanceof Nodes.Ordering) {
      const expr = (arg as any).expr;
      if (expr instanceof Nodes.Attribute) {
        refs.push(String(expr.relation.name));
      }
    } else if (arg instanceof Map) {
      for (const [key, value] of arg) {
        if (isPlainObject(value)) {
          refs.push(String(key));
        } else if (typeof key === "string") {
          const t = extractTableNameFrom(isRubySymbol(key) ? symbolToName(key) : key);
          if (t) refs.push(t);
        }
      }
    } else if (isPlainObject(arg)) {
      for (const [key, value] of Object.entries(arg)) {
        if (isPlainObject(value)) {
          refs.push(key);
        } else {
          const t = extractTableNameFrom(String(key));
          if (t) refs.push(t);
        }
      }
    }
  }
  return refs.map((ref) => Arel.sql(ref, { retryable: true }));
}

/** @internal */
export function sanitizeOrderArguments(this: QueryMethodsHost, orderArgs: unknown[]): unknown[] {
  for (let i = 0; i < orderArgs.length; i++) {
    orderArgs[i] = (this.model as any)?.sanitizeSqlForOrder?.(orderArgs[i]) ?? orderArgs[i];
  }
  return orderArgs;
}

function orderedNode(node: unknown, dir: unknown): unknown {
  return String(dir).toLowerCase() === "desc"
    ? new Nodes.Descending(node)
    : new Nodes.Ascending(node);
}

/** @internal */
export function preprocessOrderArgs(this: QueryMethodsHost, orderArgs: unknown[]): void {
  const flattened = flattenedArgs(orderArgs).map((k) =>
    typeof k === "string" && isRubySymbol(k) ? symbolToName(k) : k,
  );
  this.model.disallowRawSqlBang(flattened as (string | symbol | Nodes.Node)[], {
    permit: (
      this.model.adapterClassSync() as unknown as { columnNameWithOrderMatcher(): RegExp }
    ).columnNameWithOrderMatcher(),
  });
  validateOrderArgs.call(this, orderArgs);
  const refs = columnReferences(orderArgs);
  if (refs.length > 0) {
    (this as any).referencesValues = unionReferences((this as any).referencesValues ?? [], refs);
  }
  const mapped: unknown[] = [];
  for (const arg of orderArgs) {
    if (isRubySymbol(arg)) {
      mapped.push(new Nodes.Ascending(orderColumn.call(this, symbolToName(arg))));
    } else if (arg instanceof Map) {
      for (const [key, value] of arg) {
        mapped.push(
          key instanceof Nodes.Node
            ? orderedNode(key, value)
            : orderedNode(orderColumn.call(this, String(key)), value),
        );
      }
    } else if (isPlainObject(arg)) {
      for (const rawKey of Object.keys(arg)) {
        const key = isRubySymbol(rawKey) ? symbolToName(rawKey) : rawKey;
        const value = (arg as Record<PropertyKey, unknown>)[rawKey];
        if (isPlainObject(value)) {
          for (const [field, dir] of Object.entries(value)) {
            mapped.push(orderedNode(orderColumn.call(this, [key, field].join(".")), dir));
          }
        } else {
          mapped.push(orderedNode(orderColumn.call(this, key), value));
        }
      }
    } else {
      mapped.push(arg);
    }
  }
  orderArgs.length = 0;
  orderArgs.push(...mapped);
}

/** @internal */
export function buildOrder(this: QueryMethodsHost, arel: any): void {
  const orders = compactBlank(((this as any).orderValues ?? []) as unknown[]);
  if (orders.length > 0) arel.order?.(...orders);
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
  const builder = (this as any).predicateBuilder;
  return attrs.flatMap((attr) => {
    if (attr !== null && typeof attr === "object" && typeof (attr as any).eq === "function") {
      return [attr];
    }
    if (attr !== null && typeof attr === "object" && !Array.isArray(attr)) {
      return Object.entries(attr as Record<string, unknown>).flatMap(([table, columns]) => {
        const tableName = String(table);
        return (Array.isArray(columns) ? columns : [columns]).map(
          (column) =>
            builder?.resolveArelAttribute?.(tableName, String(column)) ??
            new ArelTable(tableName).get(String(column)),
        );
      });
    }
    const s = String(attr);
    if (s.includes(".")) {
      const [table, column] = s.split(".", 2);
      return [builder?.resolveArelAttribute?.(table, column) ?? new ArelTable(table).get(column)];
    }
    return [s];
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

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function connectionFor(modelClass: any): any {
  return threadedConnectionFor(modelClass) ?? modelClass?.connection;
}

/** @internal */
export function isTableNameMatches(this: QueryMethodsHost, from: unknown): boolean {
  const table: any = this.table;
  if (!table) return false;
  const modelClass: any = this.model;
  const name = escapeRegex(table.name);
  const quotedTableName = connectionFor(modelClass).quoteTableName(table.name);
  const quoted = escapeRegex(quotedTableName);
  const fromStr = typeof (from as any)?.toSql === "function" ? (from as any).toSql() : String(from);
  return new RegExp(`(?:^|(?<!FROM)\\s)(?:\\b${name}\\b|${quoted})(?!\\.)`, "i").test(fromStr);
}

/** @internal */
export function arelColumn(
  this: QueryMethodsHost,
  field: string | number | Nodes.Node | null,
  fallback?: (attr: string) => unknown,
): unknown {
  const modelClass: any = this.model;
  if (field instanceof Nodes.Node) return fallback ? fallback(field as any) : field;
  const isSymbol = isRubySymbol(field);
  field = isSymbol ? symbolToName(field as string) : field == null ? "" : String(field);
  field = (modelClass?.attributeAliases?.[field] as string | undefined) ?? field;

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
  const quoted = isSymbol ? connectionFor(modelClass).quoteTableName(field) : field;
  return Arel.sql(quoted);
}

/** @internal */
export function arelColumns(this: QueryMethodsHost, columns: unknown[]): unknown[] {
  return columns.flatMap((field) => {
    if (field instanceof Nodes.Node) return [field];
    if (typeof field === "string") return [arelColumn.call(this, field)];
    if (typeof field === "function") return [field()];
    if (isPlainObject(field)) return arelColumnsFromHash.call(this, field);
    return [field];
  });
}

/** @internal */
export function arelColumnWithTable(
  this: QueryMethodsHost,
  tableName: string,
  columnName: string,
): unknown {
  (this as any).referencesValues = unionReferences((this as any).referencesValues ?? [], [
    Arel.sql(tableName, { retryable: true }),
  ]);
  const isSymbol = isRubySymbol(columnName);
  if (isSymbol) columnName = symbolToName(columnName);
  const modelClass: any = this.model;
  if (isSymbol || !/\W/.test(columnName)) {
    const builder = (this as any).predicateBuilder;
    return (
      builder?.resolveArelAttribute?.(tableName, columnName, (name: string) =>
        lookupTableKlassFromJoinDependencies.call(this, name),
      ) ?? new ArelTable(tableName).get(columnName)
    );
  }
  return Arel.sql(`${connectionFor(modelClass).quoteTableName(tableName)}.${columnName}`);
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
    throw new TypeError(`Expected Symbol, String or Array, got: ${typeof columns}`);
  });
}

/**
 * @internal
 * @missingRailsCall empty? — PERMANENT
 */
export function orderColumn(this: QueryMethodsHost, field: string): unknown {
  return arelColumn.call(this, field, (attrName: string) => {
    if (attrName === "count" && ((this as any).groupValues ?? []).length > 0) {
      const table: any = this.table;
      return table.get(attrName);
    }
    return Arel.sql(connectionFor(this.model).quoteTableName(attrName), { retryable: true });
  });
}

/** @internal */
export function processSelectArgs(this: QueryMethodsHost, fields: unknown[]): unknown[] {
  return fields.flatMap((field) => {
    if (isPlainObject(field)) return arelColumnAliasesFromHash.call(this, field);
    return [field];
  });
}

function nodeAs(attr: unknown, quotedAlias: string): unknown {
  if (typeof (attr as any)?.as === "function") return (attr as any).as(quotedAlias);
  const attrSql = typeof (attr as any)?.toSql === "function" ? (attr as any).toSql() : String(attr);
  return Arel.sql(`${attrSql} AS ${quotedAlias}`);
}

/** @internal */
export function arelColumnAliasesFromHash(
  this: QueryMethodsHost,
  fields: Record<string, unknown>,
): unknown[] {
  return Object.keys(fields).flatMap((key) => {
    const columnsAliases = fields[key];
    const tableName = isRubySymbol(key) ? symbolToName(key) : key;
    const modelClass: any = this.model;
    const quoteAlias = (a: unknown): string =>
      connectionFor(modelClass).quoteColumnName(isRubySymbol(a) ? symbolToName(a) : String(a));
    if (isPlainObject(columnsAliases)) {
      return Object.keys(columnsAliases as object).map((col) => {
        const alias = (columnsAliases as any)[col];
        const attr = arelColumnWithTable.call(this, tableName, col);
        return nodeAs(attr instanceof Nodes.Node ? attr : Arel.sql(String(col)), quoteAlias(alias));
      });
    }
    if (Array.isArray(columnsAliases)) {
      return (columnsAliases as string[]).map((col) =>
        arelColumnWithTable.call(this, tableName, col),
      );
    }
    if (typeof columnsAliases === "string") {
      return [nodeAs(arelColumn.call(this, key), quoteAlias(columnsAliases))];
    }
    return [];
  });
}

/** @internal */
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

function tableStar(table: any): unknown {
  return table.get(Arel.star());
}

/** @internal */
export function buildSelect(this: QueryMethodsHost, arel: any): void {
  const model: any = this.model;
  if (any(this.selectValues)) {
    arel.project(...arelColumns.call(this, this.selectValues));
  } else if (
    (model?.ignoredColumns?.length ?? 0) > 0 ||
    model?.enumerateColumnsInSelectStatements
  ) {
    arel.project(
      ...(model?.columnNames?.() ?? []).map((field: string) => {
        const table: any = (this as any).table ?? model?.arelTable;
        return table.get(field);
      }),
    );
  } else {
    const table: any = (this as any).table ?? model?.arelTable;
    arel.project(table ? tableStar(table) : Arel.sql("*"));
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
    if (parts.length === 0) return undefined;
    return parts.reduce(
      (result: unknown, value: unknown) => new Nodes.UnionAll(result as any, value as any),
    );
  }
  throw argumentError(`Unsupported argument type: \`${String(value)}\` ${rubyClassNameOf(value)}`);
}

/** @internal */
export function buildWithValueFromHash(
  this: QueryMethodsHost,
  hash: Record<string, unknown>,
): unknown[] {
  return Object.entries(hash).map(
    ([name, value]) =>
      new Nodes.TableAlias(
        buildWithExpressionFromValue.call(this, value) as any,
        isRubySymbol(name) ? symbolToName(name) : name,
      ),
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
  joinDependencies: JoinDependency[] | undefined,
  block: (join: any) => void,
): void {
  const deps = joinDependencies ?? buildJoinDependencies.call(this);
  for (const jd of deps) {
    jd.each(block);
  }
}

/**
 * @internal
 * @missingRailsCall empty? — PERMANENT
 */
export function buildJoinDependencies(this: QueryMethodsHost): JoinDependency[] {
  const joinNames: AssociationSpec[] = [];
  const addNames = (specs: ReadonlyArray<AssociationSpec>) => {
    for (const a of specs) if (!joinNames.includes(a)) joinNames.push(a);
  };
  addNames(this.joinsValues as AssociationSpec[]);
  addNames(this.leftOuterJoinsValues);
  addNames(this.eagerLoadValues);
  addNames(this.includesValues);

  const stashedJoins: JoinDependency[] = [];
  const named = selectNamedJoins.call(this, joinNames, stashedJoins);
  const jd = constructJoinDependency.call(this, named as AssociationSpec[], null);
  stashedJoins.unshift(jd);
  return stashedJoins;
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
    arel.group(
      ...(arelColumns.call(this, [...new Set(this.groupValues)]) as (Nodes.Node | string)[]),
    );

  buildOrder.call(this, arel);
  buildWith.call(this, arel);
  buildSelect.call(this, arel);

  if (this.optimizerHintsValues.length > 0) arel.optimizerHints?.(...this.optimizerHintsValues);
  arel.distinct(this.distinctValue);

  if (!this.fromClause.isEmpty()) arel.from(buildFrom.call(this) as any);

  if (this.lockValue != null && this.lockValue !== false) arel.lock(this.lockValue);

  if (this.annotateValues.length > 0) {
    const annotates =
      this.annotateValues.length > 1 ? [...new Set(this.annotateValues)] : this.annotateValues;
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
  const cteJoins: string[] = [];
  const associations: unknown[] = [];

  for (const joinName of joinNames) {
    if (
      isRubySymbol(joinName) &&
      any(this.withValues, (cte) => joinName in cte || symbolToName(joinName) in cte)
    ) {
      cteJoins.push(symbolToName(joinName));
    } else {
      associations.push(joinName);
    }
  }

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
    } else if (association instanceof JoinDependency) {
      stashedJoins?.push(association);
    } else {
      block?.(association);
    }
  }
  return result;
}

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export function assertValidLeftOuterJoinsBang(values: unknown[]): void {
  for (const v of values) {
    if (typeof v === "string") {
      if (/\s/.test(v)) throw argumentError("only Hash, Symbol and Array are allowed");
    } else if (!Array.isArray(v) && !isPlainObject(v) && !(v instanceof JoinDependency)) {
      throw argumentError("only Hash, Symbol and Array are allowed");
    }
  }
}

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE inline-ruby-bodies-extracted-as-named-helpers
 */
export function selectInnerNamedJoins(
  this: QueryMethodsHost,
  values: unknown[],
  stashedJoins: unknown[],
  joinNodes: Nodes.Join[],
): AssociationSpec[] {
  return selectNamedJoins.call(this, values, stashedJoins, (join) => {
    if (join instanceof Nodes.Join) {
      joinNodes.push(join);
    } else if (join instanceof CTEJoin) {
      joinNodes.push(buildWithJoinNode.call(this, join.name, Nodes.InnerJoin) as Nodes.Join);
    } else {
      throw new Error(
        `unknown class: ${(join as { constructor?: { name?: string } })?.constructor?.name}`,
      );
    }
  }) as AssociationSpec[];
}

/**
 * @internal
 * @missingRailsCall empty? — PERMANENT
 */
export function buildJoinBuckets(
  this: QueryMethodsHost,
): [Record<string, unknown[]>, typeof Nodes.InnerJoin | typeof Nodes.OuterJoin] {
  const buckets = new Proxy({} as Record<string, unknown[]>, {
    get(h, k) {
      if (typeof k !== "string") return Reflect.get(h, k);
      return (h[k] ??= []);
    },
  });

  const joinsValues = this.joinsValues;

  const leftOuterJoinsValues = this.leftOuterJoinsValues;
  const stashedLeft: JoinDependency[] = [];
  if (leftOuterJoinsValues.length > 0) {
    assertValidLeftOuterJoinsBang(leftOuterJoinsValues);
    const namedLeft = selectNamedJoins.call(this, leftOuterJoinsValues, stashedLeft, (left) => {
      if (left instanceof CTEJoin) {
        buckets.join_node.push(buildWithJoinNode.call(this, left.name, Nodes.OuterJoin));
      } else {
        throw argumentError("only Hash, Symbol and Array are allowed");
      }
    });

    if (joinsValues.length === 0) {
      buckets.named_join.push(...namedLeft);
      buckets.stashed_join.push(...stashedLeft);
      return [buckets, Nodes.OuterJoin];
    }

    const leftJd = constructJoinDependency.call(
      this,
      namedLeft as AssociationSpec[],
      Nodes.OuterJoin,
    );
    stashedLeft.unshift(leftJd);
  }

  const joins = [...joinsValues];
  const lastJoinValue = joins[joins.length - 1];
  let stashedEagerLoad: JoinDependency | undefined;
  if (lastJoinValue instanceof JoinDependency) {
    if (lastJoinValue.baseKlass === this.model) {
      joins.pop();
      stashedEagerLoad = lastJoinValue;
    }
  }

  const hasStashed = Boolean(stashedEagerLoad) || stashedLeft.length > 0;

  for (const [i, v] of joins.entries()) {
    if (typeof v === "string" && !v.startsWith(":")) {
      joins[i] = new Nodes.StringJoin(Arel.sql(v.trim()) as any) as Nodes.Join;
    }
  }

  while (joins[0] instanceof Nodes.Join) {
    const joinNode = joins.shift() as Nodes.Join;
    if (!(joinNode instanceof Nodes.LeadingJoin) && hasStashed) {
      buckets.join_node.push(joinNode);
    } else {
      buckets.leading_join.push(joinNode);
    }
  }

  const innerJoinNodes: Nodes.Join[] = [];
  buckets.named_join.push(
    ...selectInnerNamedJoins.call(this, joins, buckets.stashed_join, innerJoinNodes),
  );
  buckets.join_node.push(...innerJoinNodes);

  buckets.stashed_join.push(...stashedLeft);
  if (stashedEagerLoad) buckets.stashed_join.push(stashedEagerLoad);

  return [buckets, Nodes.InnerJoin];
}

/** @internal */
export interface JoinEmissionPlan {
  leadingJoins: Nodes.Join[];
  joinNodes: Nodes.Join[];
  stashedJoins: JoinDependency[];
  namedJoins: AssociationSpec[];
  joinType: typeof Nodes.InnerJoin | typeof Nodes.OuterJoin;
  aliases?: AliasTracker;
  tracker: () => AliasTracker;
}

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE inline-ruby-bodies-extracted-as-named-helpers
 */
export function emitJoinPlan(
  this: QueryMethodsHost,
  joinSources: any[],
  plan: JoinEmissionPlan,
): void {
  if (plan.leadingJoins.length > 0) joinSources.push(...plan.leadingJoins);

  let trackerWasBuilt = false;
  const sharedTracker = (): AliasTracker => {
    trackerWasBuilt = true;
    return plan.tracker();
  };
  const references = (this as any).referencesValues;

  const namedJoins = plan.namedJoins;
  const joinType = plan.joinType;
  if (namedJoins.length > 0 || plan.stashedJoins.length > 0) {
    const jd = constructJoinDependency.call(this, namedJoins, joinType);
    joinSources.push(...jd.joinConstraints(plan.stashedJoins, sharedTracker(), references));
  }

  if (plan.joinNodes.length > 0) joinSources.push(...plan.joinNodes);

  if (plan.aliases && trackerWasBuilt) {
    for (const [name, count] of sharedTracker().aliases) {
      if (count > (plan.aliases.aliases.get(name) ?? 0)) plan.aliases.aliases.set(name, count);
    }
  }
}

/**
 * @internal
 * @missingRailsCall empty? — PERMANENT
 */
export function buildJoins(
  this: QueryMethodsHost,
  joinSources: any[],
  aliases?: AliasTracker,
): any[] {
  if (this.joinsValues.length === 0 && this.leftOuterJoinsValues.length === 0) return joinSources;

  const [buckets, joinType] = buildJoinBuckets.call(this);
  const leadingJoins = buckets.leading_join as Nodes.Join[];
  const joinNodes = buckets.join_node as Nodes.Join[];
  let memoTracker: AliasTracker | undefined;
  const tracker = (): AliasTracker => {
    memoTracker ??= this.aliasTracker([...leadingJoins, ...joinNodes], aliases?.aliases);
    return memoTracker;
  };
  emitJoinPlan.call(this, joinSources, {
    leadingJoins,
    joinNodes,
    stashedJoins: buckets.stashed_join as JoinDependency[],
    namedJoins: buckets.named_join as AssociationSpec[],
    joinType,
    aliases,
    tracker,
  });
  return joinSources;
}

/**
 * @internal
 * @missingRailsCall empty? — PERMANENT
 */
export function buildWith(this: QueryMethodsHost, arel: any): void {
  if (this.withValues.length === 0) return;

  const withStatements = this.withValues.flatMap((withValue) =>
    buildWithValueFromHash.call(this, withValue),
  );

  if (this._withIsRecursive) {
    arel.withRecursive?.(...withStatements);
  } else {
    arel.with?.(...withStatements);
  }
}

/**
 * @internal
 * @missingRailsCall first — PERMANENT
 */
export function buildWithJoinNode(
  this: QueryMethodsHost,
  name: string,
  kind: typeof Nodes.InnerJoin | typeof Nodes.OuterJoin = Nodes.InnerJoin,
): unknown {
  const withTable = new ArelTable(name);
  const table: any = this.table;
  const mc = this.model;
  return table
    .join(withTable, kind)
    .on(
      withTable
        .get(foreignKey(String(mc?.modelName ?? mc?.name ?? "Model")))
        .eq(table.get(mc?.primaryKey ?? "id")),
    )
    .joinSources()[0];
}
