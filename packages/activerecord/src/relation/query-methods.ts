/**
 * Query methods mixed into Relation: where, order, group, having,
 * limit, offset, joins, includes, select, distinct, etc.
 *
 * Mirrors: ActiveRecord::QueryMethods
 */
import * as Arel from "@blazetrails/arel";
import { Nodes, SelectManager, Table as ArelTable, relationName } from "@blazetrails/arel";
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
import type { AliasTracker } from "../associations/alias-tracker.js";
import { threadedConnectionFor } from "../connection-handling.js";
import { wrapWithScopeProxy } from "./delegation.js";
import { any, compactBlank, foreignKey, wrap } from "@blazetrails/activesupport";

/**
 * Provides chainable where.not(), where.associated(), where.missing().
 * Returned by `Relation#where()` when called with no arguments.
 *
 * Mirrors: ActiveRecord::QueryMethods::WhereChain (query_methods.rb:11-148)
 */
export class WhereChain<R = any> {
  private _scope: R;

  constructor(scope: R) {
    this._scope = scope;
  }

  /**
   * Mirrors: WhereChain#not (query_methods.rb:49-55) — `build_where_clause`
   * then `@scope.where_clause += where_clause.invert`.
   */
  not(opts: Record<string, unknown>): R;
  not(opts: unknown[]): R;
  not(cols: string[], tuples: unknown[][]): R;
  not(opts: Record<string, unknown> | string[] | unknown[], ...rest: unknown[]): R {
    const scope = this._scope as unknown as QueryMethodsHost;
    // Composite-key positional form (`where.not(cols, tuples)`): the JS analog
    // of Rails' `where.not([c1, c2] => tuples)`, since JS object keys can't be
    // arrays. Kept symmetric with `where`'s composite guard, so a mixed-type
    // array (`where.not(["a", 5], ...)`) falls through to `build_where_clause`.
    if (
      Array.isArray(opts) &&
      rest.length > 0 &&
      opts.every((c) => typeof c === "string") &&
      Array.isArray(rest[0])
    ) {
      // Rails passes `lookup_table_klass_from_join_dependencies` as the block
      // to `build_from_hash` (query_methods.rb:1643-1645) so a qualified col
      // naming a manual-join table binds through the joined model's type.
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

  /**
   * Mirrors: WhereChain#associated (query_methods.rb:88-101).
   */
  associated(...associations: string[]): R {
    const scope = this._scope as unknown as QueryMethodsHost;
    for (const association of associations) {
      const reflection = this.scopeAssociationReflection(association);
      // Rails tests `reflection.name` but joins the caller's own `association`
      // (query_methods.rb:91-92); both are Symbols, spelled with their colon.
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
      // query_methods.rb:96-99 — the `class_name:` branch keys the hash with the
      // association Symbol, the `else` branch with the table-name String.
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

  /**
   * Mirrors: WhereChain#missing (query_methods.rb:124-137).
   */
  missing(...associations: string[]): R {
    const scope = this._scope as unknown as QueryMethodsHost;
    for (const association of associations) {
      const reflection = this.scopeAssociationReflection(association);
      leftOuterJoinsBang.call(scope, isRubySymbol(association) ? association : `:${association}`);
      const associationConditions = Object.fromEntries(
        wrap(reflection.associationPrimaryKey()).map((pk) => [pk, null]),
      );
      // query_methods.rb:130-133 — Symbol key for the `class_name:` branch, the
      // table-name String otherwise.
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

  /** Mirrors: WhereChain#scope_association_reflection (query_methods.rb:140-147). */
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

/**
 * Internal node representing a CTE-based JOIN.
 *
 * Mirrors: ActiveRecord::QueryMethods::CTEJoin
 */
export class CTEJoin {
  readonly name: string;

  constructor(name: string) {
    this.name = name;
  }
}

/**
 * A single eager-loading specification: either a plain association name string
 * or a nested hash mirroring Rails' `includes(author: :posts)` syntax. `null` /
 * `undefined` entries (and `null` hash values) are tolerated and ignored,
 * mirroring Rails' `Array(nil)` handling in `includes(nil)` / `includes(posts: nil)`.
 *
 * Mirrors: the argument accepted by ActiveRecord::QueryMethods#includes,
 * #preload, and #eager_load.
 */
export type AssociationSpec =
  | string
  | null
  | undefined
  | AssociationSpec[]
  | { [assoc: string]: AssociationSpec | AssociationSpec[] };

/**
 * A single `joins` argument. Like {@link AssociationSpec} but also admits Arel
 * `Nodes.Join` at any array depth, mirroring Rails' `args.flatten!` over
 * arbitrary join args before `joins_values |= args` (query_methods.rb:868-875).
 */
export type JoinSpec = AssociationSpec | Nodes.Join | JoinSpec[];

/** Mirrors: ActiveRecord::QueryMethods::FROZEN_EMPTY_ARRAY (query_methods.rb:159). */
export const FROZEN_EMPTY_ARRAY: readonly never[] = Object.freeze([]);

/** Mirrors: ActiveRecord::QueryMethods::FROZEN_EMPTY_HASH (query_methods.rb:160). */
export const FROZEN_EMPTY_HASH: Readonly<Record<string, never>> = Object.freeze({});

/**
 * Generate the `*_values` / `*_value` / `*_clause` accessors over `@values` —
 * one reader/writer pair per `Relation::VALUE_METHODS` entry, plus the trailing
 * `alias extensions extending_values`.
 *
 * Mirrors: the `Relation::VALUE_METHODS.each` / `class_eval` loop at
 * query_methods.rb:162-183. The reader is `@values.fetch(:<name>, <default>)`,
 * so a *stored* `null`/`false` is returned rather than the default; the writer
 * is `assert_modifiable!` then `@values[:<name>] = value`.
 *
 * @noRailsEquivalent PERMANENT: Ruby reopens `module QueryMethods` and `class_eval`s the
 *   accessors, naming `Relation::VALUE_METHODS` at load time under Zeitwerk.
 *   ESM has neither reopening nor autoload, so the loop is exported as a
 *   function `relation.ts` calls on its own class beside its other
 *   `include(Relation, …)` mixins — which is also what keeps the constant
 *   resolution call-time.
 */
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
      // Ruby `nil` is spelled `null`, never `undefined`: an unset single value
      // is passed straight through to callees with Ruby-style optional
      // parameters (`arel.distinct(distinct_value)` over Arel's
      // `distinct(value = true)`), and a JS default parameter would swallow an
      // `undefined` and substitute its own default (CLAUDE.md, "kwargs").
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

/**
 * A single argument to `order`/`reorder`. Besides the flat
 * `{ col: "asc" }` hash, Rails accepts a nested `{ table: { col: "asc" } }`
 * form that expands to a `table.col dir` qualified order.
 */
export type OrderArg =
  | string
  | Record<string, OrderDirection | Record<string, OrderDirection>>
  | Nodes.Node
  | string[]
  | [Nodes.Node, ...unknown[]]
  | Map<Nodes.Node | string, OrderDirection>
  // Rails' order/reorder accept nil (`reorder(nil)` clears the order); the empty
  // -argument guard compact_blanks it away before it reaches the bang variant.
  | null;

interface QueryMethodsHost {
  /** Rails `delegate :primary_key, to: :model` (delegation.rb:106). */
  primaryKey: string | string[];
  /** Rails `@values` (relation.rb:86) — the hash behind every value method. */
  _values: Record<string, unknown>;
  // The `VALUE_METHODS.each`-generated accessors (query_methods.rb:162-181).
  whereClause: WhereClause;
  havingClause: WhereClause;
  fromClause: FromClause;
  includesValues: AssociationSpec[];
  eagerLoadValues: AssociationSpec[];
  preloadValues: AssociationSpec[];
  selectValues: any[];
  groupValues: string[];
  orderValues: Array<string | Nodes.Node>;
  joinsValues: (AssociationSpec | string | Nodes.Join)[];
  leftOuterJoinsValues: AssociationSpec[];
  referencesValues: Array<string | Nodes.SqlLiteral>;
  extendingValues: Array<Record<string, (...args: any[]) => any>>;
  unscopeValues: Array<string | { where: string | string[] }>;
  optimizerHintsValues: string[];
  annotateValues: string[];
  withValues: Array<Record<string, unknown>>;
  /** Mirrors Rails' `@with_is_recursive` (query_methods.rb:527). */
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
  // Converged Rails `Relation#alias_tracker(joins, aliases)` (relation.rb:1307);
  // `buildJoins` reads it to build the shared `build_joins` tracker.
  aliasTracker(joins?: Nodes.Node[], aliases?: Map<string, number>): AliasTracker;
  /** Rails' `clone` behind `spawn` (spawn_methods.rb:9-11). */
  clone(): any;
  /** Mirrors: ActiveRecord::SpawnMethods#spawn (spawn_methods.rb:9-11). */
  spawn(): any;
  /** Rails `Relation#to_arel` — the built SelectManager (`arel`'s callee). */
  toArel(aliases?: AliasTracker): any;
  /** Mirrors: `attr_accessor :skip_preloading_value` (relation.rb:72). */
  skipPreloadingValue: boolean;
  _model: typeof import("../base.js").Base;
  model: QueryMethodsHost["_model"];
  /** Rails `attr_reader :table` (relation.rb:71) — the relation's own Arel table. */
  table: ArelTable;
  predicateBuilder: import("./predicate-builder.js").PredicateBuilder;
}

// ---------------------------------------------------------------------------
// Bang variants — mutate `this` in place, return `this`.
// In Rails, every query method `foo` has a `foo!` that mutates self.
// The non-bang version calls `spawn.foo!` (clone then mutate).
// ---------------------------------------------------------------------------

// Rails' includes!/eager_load!/preload! union (`|=`) rather than append, which
// dedups by eql?/hash — structural for Symbol/String/Hash specs alike. Mirror
// that with structuralUnionEq so a repeated `includes(:x)`/`preload(:x)` folds
// to one spec instead of making the preloader load it twice.
function unionAppend<T>(target: readonly T[], incoming: readonly T[]): T[] {
  const union = [...target];
  for (const spec of incoming) {
    if (!union.some((seen) => structuralUnionEq(seen, spec))) union.push(spec);
  }
  return union;
}

/**
 * Specify associations to be eager loaded (preload strategy).
 *
 * Mirrors: ActiveRecord::QueryMethods#includes (query_methods.rb:250-253)
 */
function includes(this: QueryMethodsHost, ...args: AssociationSpec[]): any {
  checkIfMethodHasArgumentsBang.call(this, ":includes", args);
  return includesBang.apply(this.spawn(), args);
}

function includesBang(this: QueryMethodsHost, ...associations: AssociationSpec[]): any {
  this.includesValues = unionAppend(this.includesValues, associations);
  return this;
}

/**
 * Mirrors: ActiveRecord::QueryMethods#all (query_methods.rb:260-262)
 */
function all(this: QueryMethodsHost): any {
  return this.spawn();
}

/**
 * Specify associations to be eager loaded using a LEFT OUTER JOIN.
 *
 * Mirrors: ActiveRecord::QueryMethods#eager_load (query_methods.rb:290-293)
 */
function eagerLoad(this: QueryMethodsHost, ...args: AssociationSpec[]): any {
  checkIfMethodHasArgumentsBang.call(this, ":eager_load", args);
  return eagerLoadBang.apply(this.spawn(), args);
}

function eagerLoadBang(this: QueryMethodsHost, ...associations: AssociationSpec[]): any {
  this.eagerLoadValues = unionAppend(this.eagerLoadValues, associations);
  return this;
}

/**
 * Specify associations to be eager loaded using separate queries.
 *
 * Mirrors: ActiveRecord::QueryMethods#preload (query_methods.rb:322-325)
 */
function preload(this: QueryMethodsHost, ...args: AssociationSpec[]): any {
  checkIfMethodHasArgumentsBang.call(this, ":preload", args);
  return preloadBang.apply(this.spawn(), args);
}

function preloadBang(this: QueryMethodsHost, ...associations: AssociationSpec[]): any {
  this.preloadValues = unionAppend(this.preloadValues, associations);
  return this;
}

/**
 * Extracts a named `association` from the relation.
 *
 * Mirrors: ActiveRecord::QueryMethods#extract_associated (query_methods.rb:341-343)
 */
async function extractAssociated(this: QueryMethodsHost, association: string): Promise<any[]> {
  const records = await preload.call(this, association);
  return Promise.all(records.map((record: any) => record[association]()));
}

/**
 * Indicate that the given `tableNames` are referenced by an SQL string, and
 * should therefore be JOINed rather than loaded separately.
 *
 * Mirrors: ActiveRecord::QueryMethods#references (query_methods.rb:355-358)
 */
function references(this: QueryMethodsHost, ...tableNames: Array<string | Nodes.SqlLiteral>): any {
  checkIfMethodHasArgumentsBang.call(this, ":references", tableNames);
  return referencesBang.apply(this.spawn(), tableNames);
}

function referencesBang(
  this: QueryMethodsHost,
  ...tableNames: Array<string | Nodes.SqlLiteral>
): any {
  // `self.references_values |= table_names` (query_methods.rb:360-363). Ruby's
  // SqlLiteral is a String subclass, so the union compares by SQL text and the
  // FIRST occurrence is the one kept — an `Arel.sql("foo")` already present is
  // not downgraded by a later bare `"foo"`, and vice versa.
  this.referencesValues = unionReferences(this.referencesValues, tableNames);
  return this;
}

/** Ruby `SqlLiteral < String`, so a reference compares by its SQL text. */
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
 * Table names implied by hash conditions — nested-hash keys and dotted string
 * keys — as plain strings. Used to auto-add references so
 * `includes(...).where("joined_table.col": ...)` promotes the matching include
 * to an eager LEFT OUTER JOIN. Returns `[]` for non-hash opts (string SQL,
 * Arel nodes, composite-key arrays), mirroring Rails' `when Hash` branch.
 *
 * Mirrors: ActiveRecord::QueryMethods#build_where_clause (query_methods.rb:1640)
 * — `references = PredicateBuilder.references(opts)`.
 * @internal
 */
export function referencesFromConditions(conditions: unknown): Nodes.SqlLiteral[] {
  if (!isPlainObject(conditions)) return [];
  // `PredicateBuilder.references` yields `Arel.sql(key, retryable: true)`
  // (predicate_builder.rb:28-36) — SqlLiterals, which is what makes a hash
  // condition's table able to alias its eager-load join
  // (join_dependency.rb:90-92).
  return PredicateBuilder.references(conditions);
}

/**
 * Add a Common Table Expression (WITH clause).
 *
 * Mirrors: ActiveRecord::QueryMethods#with (query_methods.rb:493-497). The
 * function is spelled `withCte` only because `with` is a reserved word in a TS
 * function declaration; it is mixed in — and called — as `with`.
 */
function withCte(this: QueryMethodsHost, ...args: any[]): any {
  // Rails' `raise ArgumentError ... if block_given?` (query_methods.rb:494). A
  // trailing function argument is the TS equivalent of a Ruby block — `with`
  // takes CTE definition hashes, never a callback.
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

/**
 * Add a recursive Common Table Expression (WITH RECURSIVE clause).
 *
 * Mirrors: ActiveRecord::QueryMethods#with_recursive (query_methods.rb:518-521)
 * — unlike `with`, it has no `block_given?` guard.
 */
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

/**
 * Select specific columns, or filter loaded records with a block.
 *
 * Mirrors: ActiveRecord::QueryMethods#select (query_methods.rb:413-424)
 *
 * Examples:
 *   select("name", "email")          // column projection
 *   select("COUNT(*) as total")       // raw SQL expression
 *   select(record => record.active)   // block form (returns array)
 */
function select(this: QueryMethodsHost, ...fields: any[]): any {
  // Block form first — mirrors Rails' `if block_given?` guard before
  // check_if_method_has_arguments!. A trailing function argument is the TS
  // equivalent of a Ruby block.
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

/**
 * Replace existing select columns.
 *
 * Mirrors: ActiveRecord::QueryMethods#reselect (query_methods.rb:541-545)
 */
function reselect(this: QueryMethodsHost, ...args: any[]): any {
  checkIfMethodHasArgumentsBang.call(this, ":reselect", args);
  args = processSelectArgs.call(this, args);
  return reselectBang.apply(this.spawn(), args);
}

function reselectBang(this: QueryMethodsHost, ...columns: any[]): any {
  this.selectValues = columns.map((c: any) => {
    if (c instanceof Nodes.Node) return c;
    if (typeof c === "object" && c !== null && "value" in c)
      return new Nodes.SqlLiteral((c as { value: string }).value);
    return String(c);
  });
  return this;
}

/**
 * Union additional select columns into the existing list. Mirrors Rails'
 * private `_select!` which uses `select_values |= fields.flatten` — the
 * `|=` form unique-unions both sides, so duplicates are dropped even on
 * the first assignment (when select_values was empty).
 */
function _selectBang(this: QueryMethodsHost, ...columns: any[]): any {
  const flat = columns.flat(Infinity);
  const normalized = flat.map((c: any) => {
    if (c instanceof Nodes.Node) return c;
    // Rails' `_select!(-> { aliases.columns })` (join_dependency.rb:155) stores
    // the Proc itself; `arel_columns` calls it at build_select time.
    if (typeof c === "function") return c;
    if (typeof c === "object" && c !== null && "value" in c)
      return new Nodes.SqlLiteral((c as { value: string }).value);
    return String(c);
  });
  const seenStrings = new Set<string>();
  const seenNodeHashes = new Map<number, Nodes.Node[]>();
  const nodeIsDuplicate = (node: Nodes.Node): boolean => {
    const h = node.hash();
    const bucket = seenNodeHashes.get(h);
    if (!bucket) return false;
    return bucket.some((n) => n.eql(node));
  };
  const addNodeToSeen = (node: Nodes.Node): void => {
    const h = node.hash();
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
      // Ruby `|=` dedups Procs by object identity.
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

/**
 * Add GROUP BY.
 *
 * Mirrors: ActiveRecord::QueryMethods#group (query_methods.rb:573-576)
 */
function group(this: QueryMethodsHost, ...args: (string | Nodes.Node)[]): any {
  checkIfMethodHasArgumentsBang.call(this, ":group", args as unknown[]);
  return groupBang.apply(this.spawn(), args);
}

function groupBang(
  this: QueryMethodsHost,
  ...columns: (string | import("@blazetrails/arel").Nodes.Node)[]
): any {
  this.groupValues = [...this.groupValues, ...(columns as string[])];
  return this;
}

/**
 * Replace GROUP BY columns.
 *
 * Mirrors: ActiveRecord::QueryMethods#regroup (query_methods.rb:593-596)
 */
function regroup(this: QueryMethodsHost, ...args: string[]): any {
  checkIfMethodHasArgumentsBang.call(this, ":regroup", args);
  return regroupBang.apply(this.spawn(), args);
}

function regroupBang(
  this: QueryMethodsHost,
  ...columns: (string | import("@blazetrails/arel").Nodes.Node)[]
): any {
  this.groupValues = [...(columns as string[])];
  return this;
}

/**
 * Add ORDER BY. Accepts column name or { column: "asc"|"desc" }.
 *
 * Mirrors: ActiveRecord::QueryMethods#order (query_methods.rb:656-662)
 */
function order(this: QueryMethodsHost, ...args: OrderArg[]): any {
  checkIfMethodHasArgumentsBang.call(this, ":order", args as unknown[], undefined, () => {
    sanitizeOrderArguments.call(this, args as unknown[]);
  });
  return orderBang.apply(this.spawn(), args);
}

function orderBang(this: QueryMethodsHost, ...args: OrderArg[]): any {
  if (args.length > 0) preprocessOrderArgs.call(this, args as unknown[]);
  // Mirrors Rails' `self.order_values |= args`: union dedupes repeated terms.
  this.orderValues = dedupeOrderClauses([
    ...this.orderValues,
    ...(args as unknown[]),
  ]) as typeof this.orderValues;
  return this;
}

/**
 * Order by specific values of a column.
 *
 * Mirrors: ActiveRecord::QueryMethods#in_order_of (query_methods.rb:717-741) —
 * the permit matcher comes off `model.adapter_class`, a class-level lookup that
 * leases no connection.
 */
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

  // Mirrors Rails: `values.map { |v| model.type_caster.type_cast_for_database(column, v) }`.
  // Cast each value to its database form so the CASE/IN predicates match a typed
  // column (e.g. enum integer mappings, date/time serialization) instead of the
  // JS-native string/number form. An Arel node finds no attribute type and falls
  // through to ValueType (no-op cast). `undefined` is normalized to `null` so
  // `eq(null)` emits IS NULL rather than the invalid `= NULL`.
  const typeCaster = new TypeCasterMap(this.model);
  values = values.map((value) => {
    if (value === undefined || value === null) return null;
    return typeCaster.typeCastForDatabase(column, value);
  });

  // Mirrors Rails: `column.is_a?(Arel::Nodes::SqlLiteral) ? column : order_column(column.to_s)`.
  // An Arel expression (e.g. `Arel.sql("id * 2")`) is used verbatim; a string/symbol
  // resolves through orderColumn, which handles `"table.column"` for joined associations.
  const arelColumn: any =
    column instanceof Nodes.SqlLiteral ? column : orderColumn.call(this, String(column));

  let scope = orderBang.call(
    this.spawn(),
    buildCaseForValuePosition.call(this, arelColumn, values, { filter }) as any,
  );

  // The values were already database-cast above via type_cast_for_database, and `in`
  // wraps each in Casted, which casts again on value_for_database. That double-cast is
  // faithful because Rails does the identical one (query_methods.rb:724 then :735,
  // casted.rb:19-20) — not because the second cast is inert; a non-idempotent
  // serialize would run twice here exactly as it does in Rails.
  if (filter) {
    // Mirrors Rails: `arel_column.in(values.compact).or(arel_column.eq(nil))`
    // (query_methods.rb:732) — Arel's `or` wraps the pair in a Grouping itself.
    const whereClause: Nodes.Node = values.includes(null)
      ? (arelColumn.in(values.filter((v) => v !== null)) as Nodes.Node).or(arelColumn.eq(null))
      : arelColumn.in(values);

    scope = whereBang.call(scope, whereClause);
  }

  return scope;
}

/**
 * Replace ordering.
 *
 * Mirrors: ActiveRecord::QueryMethods#reorder (query_methods.rb:752-757)
 */
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
// Remove duplicate order terms while preserving first-seen order. orderBang
// mirrors Rails' `self.order_values |= args` and reorderBang its `args.uniq!` —
// both dedupe by value (query_methods.rb order!/reorder!).
//
// Ruby compares Arel nodes structurally (Arel::Nodes::Node#eql?), so the key is
// structural: an Attribute holds a back reference to its Arel::Table, which
// JSON.stringify cannot serialize.
let orderClauseIdentity = 0;
const orderClauseIdentities = new WeakMap<object, number>();

function orderClauseKey(clause: unknown): string {
  if (typeof clause === "string") return `s:${clause}`;
  if (clause instanceof Nodes.SqlLiteral) return `s:${String((clause as any).value ?? "")}`;
  if (clause instanceof Nodes.Attribute) {
    return `a:${relationName((clause as any).relation?.name)}.${(clause as any).name}`;
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

/**
 * Valid argument values for `unscope`. The TS API is camelCase only —
 * no Rails snake_case aliases. Mirrors Rails' VALID_UNSCOPING_VALUES
 * set (relation/query_methods.rb), camelCased:
 *
 *   where, select, group, order, lock, limit, offset, joins,
 *   left_outer_joins, includes, preload, eager_load, from, readonly,
 *   having, optimizer_hints, annotate, create_with
 *
 * → camelCase: where, select, group, order, lock, limit, offset,
 *   joins, leftOuterJoins, includes, preload, eagerLoad, from,
 *   readonly, having, optimizerHints, annotate, createWith.
 */
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

/**
 * Value keys accepted by `SpawnMethods#except` — Rails' `Relation::VALUE_METHODS`.
 * A superset of `UnscopeType`: it additionally covers value keys that have no
 * `unscope` equivalent (`distinct`, `strictLoading`, `references`, `extending`,
 * `unscope`, `reordering`, `skipQueryCache`, `reverseOrder`), mirroring
 * `relation_with values.except(*skips)`.
 *
 * `reverseOrder` (`:reverse_order`, a SINGLE_VALUE_METHOD) is included for
 * surface parity with `Relation::VALUE_METHODS` and the merger, but resetting it
 * is a faithful no-op: trails applies `reverseOrder` eagerly (flipping
 * `orderValues` in place), leaving `reverseOrderValue` vestigial-nil — exactly
 * as the pinned Rails' `reverse_order!` leaves `values[:reverse_order]` nil.
 */
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

/**
 * The full `Relation::VALUE_METHODS` key surface handled by `SpawnMethods#except`
 * (reset the named keys) and `SpawnMethods#only` (reset every key NOT named — the
 * complement of `values.slice(*onlies)`). A superset of `VALID_UNSCOPING_VALUES`
 * with the seven value keys that have no `unscope` equivalent.
 */
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

/**
 * Argument type for `SpawnMethods#except`. Rails' `values.except(*skips)`
 * (spawn_methods.rb:59-60) accepts ANY key — unrecognized ones are a silent
 * no-op. The `(string & {})` arm preserves `ExceptKey` autocomplete while
 * still admitting arbitrary strings without a cast (e.g. `Post.except("bogus")`).
 */
export type ExceptSkip = ExceptKey | (string & {});

/**
 * Replace `@values` wholesale.
 *
 * Mirrors: the assignment in `SpawnMethods#relation_with` (spawn_methods.rb:71-74),
 * `spawn.tap { |r| r.values = values }` — a key the incoming hash omits simply
 * reads back as its default.
 *
 * @internal
 */
export function setValues(host: QueryMethodsHost, values: Record<string, unknown>): void {
  host._values = values;
}

/**
 * Remove specific query parts.
 *
 * Mirrors: ActiveRecord::QueryMethods#unscope (query_methods.rb:806-809)
 */
function unscope(
  this: QueryMethodsHost,
  ...args: Array<UnscopeType | { where: string | string[] }>
): any {
  checkIfMethodHasArgumentsBang.call(this, ":unscope", args as unknown[]);
  return unscopeBang.apply(this.spawn(), args as any);
}

function unscopeBang(
  this: QueryMethodsHost,
  ...types: Array<string | { where: string | string[] }>
): any {
  // Rails unscope! does `self.unscope_values += args` so a later merge of this
  // relation re-applies the resets (query_methods.rb / merger.rb).
  this.unscopeValues = [...this.unscopeValues, ...types];
  for (const rawScope of types) {
    if (typeof rawScope === "string") {
      // Rails: `scope = :left_outer_joins if scope == :left_joins` — the
      // `leftJoins` alias is normalized before the validity check, so it is
      // not itself a member of VALID_UNSCOPING_VALUES.
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

/**
 * Add one or more INNER JOINs. Accepts an association name (resolved through
 * reflection), a raw SQL join string, Arel `Nodes.Join` instances, or a nested
 * association hash — any mix of the above as variadic args. For an explicit
 * JOIN/ON pair, pass the full raw SQL fragment as a single string (Rails'
 * verbatim-fragment path): trails collapses Ruby Symbols to strings, so there
 * is no type-based way to tell a `(table, on)` pair from `joins(:a, :b)`.
 *
 * Mirrors: ActiveRecord::QueryMethods#joins (query_methods.rb:868-871)
 */
function joins(this: QueryMethodsHost, ...args: JoinSpec[]): any {
  checkIfMethodHasArgumentsBang.call(this, ":joins", args as unknown[]);
  return joinsBang.apply(this.spawn(), args as (string | Nodes.Join)[]);
}

function joinsBang(this: QueryMethodsHost, ...args: (string | Nodes.Join)[]): any {
  // Rails joins! uses |= (array union), deduplicating by Ruby eql?/hash —
  // structural for Hash specs, strings, and even Arel nodes (Arel::Nodes::Binary
  // defines eql?/hash by class + members, arel/nodes/binary.rb:20-29).
  // structuralUnionEq mirrors that: === first, then deepEqual (which delegates
  // to a node's own eql for Arel nodes).
  for (const arg of args) {
    if (!this.joinsValues.some((seen) => structuralUnionEq(seen, arg)))
      this.joinsValues = [...this.joinsValues, arg];
  }
  return this;
}

/**
 * Perform LEFT OUTER JOINs on `args`.
 *
 * Mirrors: ActiveRecord::QueryMethods#left_outer_joins
 * (query_methods.rb:883-887). Rails' `alias :left_joins :left_outer_joins`
 * shares this body and reads the called name back out of `__callee__`, which
 * TS has no equivalent for — so `leftJoins` below carries the same two lines
 * with its own name rather than routing through an invented shared helper.
 */
function leftOuterJoins(this: QueryMethodsHost, ...args: AssociationSpec[]): any {
  checkIfMethodHasArgumentsBang.call(this, ":left_outer_joins", args);
  // `left_outer_joins!` stores args verbatim and only raises for a
  // non-Hash/Symbol/Array arg lazily at SQL-build time, in `build_join_buckets`
  // (query_methods.rb:1828-1834) — not eagerly here.
  return leftOuterJoinsBang.apply(this.spawn(), args);
}

/**
 * Mirrors: `alias :left_joins :left_outer_joins` (query_methods.rb:888).
 */
function leftJoins(this: QueryMethodsHost, ...args: AssociationSpec[]): any {
  checkIfMethodHasArgumentsBang.call(this, ":left_joins", args);
  return leftOuterJoinsBang.apply(this.spawn(), args);
}

function leftOuterJoinsBang(this: QueryMethodsHost, ...args: AssociationSpec[]): any {
  // Mirrors Rails left_outer_joins! which stores into left_outer_joins_values
  // (separate from joins_values, which is the inner-join path).
  // |= dedups by eql?/hash — structural for Hash specs, not JS reference.
  for (const arg of args) {
    if (!this.leftOuterJoinsValues.some((seen) => structuralUnionEq(seen, arg)))
      this.leftOuterJoinsValues = [...this.leftOuterJoinsValues, arg];
  }
  return this;
}

/**
 * @internal
 *
 * @missingRailsCall order:constructor,sql — CONVERGEABLE: Verified per-site (RFC 0106): ORDER
 *   only. Rails reaches `Arel.sql(opts)` in the String arm
 *   (query_methods.rb:1623) before the `WhereClause.new` at the bottom, and
 *   handles a bare Arel node in the same trailing `else`; the port early-returns
 *   the node arm as `new WhereClause([opts])` (query-methods.ts:1143) above the
 *   String arm, so the constructor is first in TS evaluation order. Same calls,
 *   same results. Tracked by story query-methods-order-only-call-inversions
 *   (RFC 0106).
 */
export function buildWhereClause(
  this: QueryMethodsHost,
  opts: unknown,
  rest: unknown[] = [],
): WhereClause {
  // Mirrors build_where_clause (query_methods.rb:1614): unwrap/forbid
  // strong-params objects before any other handling.
  opts = sanitizeForbiddenAttributes(opts as Record<string, unknown>);

  if (Array.isArray(opts)) {
    // Mirrors Ruby `opts, *rest = opts` (query_methods.rb:1616-1618): the
    // array destructure OVERWRITES rest with the array's tail, discarding any
    // rest that was passed alongside the array — it does not append to it.
    const [head, ...tail] = opts as unknown[];
    return buildWhereClause.call(this, head, tail);
  }

  if (opts instanceof Nodes.Node) return new WhereClause([opts]);

  if (typeof opts === "string") {
    // Mirrors build_where_clause (query_methods.rb:1620-1628): a bare fragment is
    // wrapped verbatim as Arel.sql(opts); a fragment whose first rest arg is a
    // Hash and that carries a `:word` token builds a named BoundSqlLiteral; a `?`
    // fragment builds a positional BoundSqlLiteral; any remaining rest-bearing
    // fragment (no `?`, no named hash) falls back to sanitize_sql.
    let parts: Nodes.Node[];
    if (rest.length === 0) {
      parts = [Arel.sql(opts)];
    } else if (isPlainObject(rest[0]) && /:\w+/.test(opts)) {
      parts = [buildNamedBoundSqlLiteral.call(this, opts, rest[0])];
    } else if (opts.includes("?")) {
      parts = [buildBoundSqlLiteral.call(this, opts, rest)];
    } else {
      parts = [
        new Nodes.SqlLiteral(this.model.sanitizeSql(rest.length === 0 ? opts : [opts, ...rest])!),
      ];
    }
    return new WhereClause(parts);
  }

  if (isPlainObject(opts)) {
    // Mirrors build_where_clause (query_methods.rb:1640): a hash condition
    // auto-adds references for its nested-hash / dotted-key tables, so an
    // includes(...) with a WHERE on the joined table promotes to eager JOIN.
    const mc = this.model;
    const aliases: Record<string, string> = mc?.attributeAliases ?? {};
    // Rails never pre-casts hash values here — build_where_clause hands them
    // raw to PredicateBuilder, whose QueryAttribute bind casts/serializes at
    // compile time (predicate_builder.rb:57-69 → build_bind_attribute →
    // value_for_database).
    // Rails `opts.transform_keys { |key| key = key.to_s; attribute_aliases[key]
    // || key }` (query_methods.rb:1632-1638) — `to_s` on a Symbol key drops the
    // leading colon trails spells it with, so an association-named key and a
    // table-named key are one string from here on, and `references` /
    // `build_from_hash` both see the bare name.
    const transformed: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(opts)) {
      const name = isRubySymbol(key) ? symbolToName(key) : key;
      const resolved = aliases[name] ?? name;
      transformed[resolved] = value;
    }
    opts = transformed;
    // query_methods.rb:1640-1641 — references are taken from the TRANSFORMED
    // hash, after key stringification.
    referencesBang.call(this, ...referencesFromConditions(opts));
    const parts = this.predicateBuilder.buildFromHash(
      opts as Record<string, unknown>,
      (tableName: string) => lookupTableKlassFromJoinDependencies.call(this, tableName),
    );
    return new WhereClause(parts);
  }

  throw argumentError(`Unsupported argument type: ${String(opts)} (${typeof opts})`);
}

/**
 * Add WHERE conditions. Accepts:
 *  - a hash of column/value pairs
 *  - a raw SQL string with optional bind values
 *  - an Arel `Nodes.Node`
 *  - composite-key positional form: `where(['c1','c2'], [[v1a,v1b], ...])`
 *    (the JS analog of Rails' `where({[c1, c2] => [tuples]})` —
 *    JS object keys can't be arrays, so columns become a leading
 *    positional argument)
 *
 * Mirrors: ActiveRecord::QueryMethods#where (query_methods.rb:1033-1041)
 *
 * Examples:
 *   where({ name: "dean" })
 *   where("age > ?", 18)
 *   where("name LIKE ?", "%dean%")
 *   where(['shop_id', 'order_number'], [[1, 100], [2, 200]])
 */
function where(
  this: QueryMethodsHost,
  conditionsOrSql?: Record<string, unknown> | string | Nodes.Node | string[] | unknown[] | null,
  ...rest: unknown[]
): any {
  if (conditionsOrSql === undefined) return new WhereChain(this.spawn());
  // Rails: a single blank-ish argument (`args.length == 1 && args.first.blank?`,
  // query_methods.rb:1036) makes `where` a no-op returning the relation
  // unchanged — `where({})` / `where([])` / `where(null)` / `where("")` all
  // match every row. This applies ONLY to the single-argument call:
  // `where([], tuples)` (a 2-arg composite) must fall through so the empty
  // column list raises rather than silently no-opping. Short-circuiting the
  // empty top-level hash here (rather than in the predicate builder) is what
  // lets a NESTED empty hash (`where(posts: {})`) still expand to the `1=0`
  // contradiction Rails' `expand_from_hash` returns.
  if (rest.length === 0 && isBlankArgument(conditionsOrSql)) {
    return this;
  }
  // Composite-key form: array of column names + array of tuples. It is
  // always a two-argument call (`where(cols, tuples)`), so it is
  // disambiguated from Rails' sanitized-array conditions form
  // (`where(["name = ?", x])`, a single array argument) by the presence of
  // the extra `tuples` argument. A single all-strings array falls through
  // to `buildWhereClause`, which unwraps `[head, ...tail]` and sanitizes.
  if (
    Array.isArray(conditionsOrSql) &&
    rest.length > 0 &&
    conditionsOrSql.every((c) => typeof c === "string")
  ) {
    if (rest.length !== 1 || !Array.isArray(rest[0])) {
      throw argumentError(
        "Relation#where(cols, tuples): composite-key form requires a tuples argument as an array of arrays",
      );
    }
    const cols = conditionsOrSql as string[];
    const tuples = rest[0] as unknown[][];
    // buildComposite returns the WhereClause predicates directly (the native
    // PredicateBuilder currency); spread them into the clause exactly as
    // buildWhereClause spreads buildFromHash's result, so a single tuple stays
    // flat (`WHERE c1 = ? AND c2 = ?`, no wrapping Grouping) like Rails.
    //
    // Rails passes `lookup_table_klass_from_join_dependencies` as the block to
    // `predicate_builder.build_from_hash` (query_methods.rb:1643-1645) so a
    // qualified col naming a manual-join table binds through the joined
    // model's column type.
    const nodes = this.predicateBuilder.buildComposite(
      cols,
      tuples,
      (tableName) =>
        lookupTableKlassFromJoinDependencies.call(this, tableName) as
          | QueryMethodsHost["_model"]
          | null,
    );
    if (nodes.length === 0) return noneBang.call(this.spawn());
    const rel = this.spawn();
    rel.whereClause = rel.whereClause.plus(new WhereClause([...nodes]));
    return rel;
  }
  return whereBang.call(
    this.spawn(),
    conditionsOrSql as Record<string, unknown> | string | Nodes.Node | null,
    ...rest,
  );
}

function whereBang(this: QueryMethodsHost, opts: any, ...rest: unknown[]): any {
  const clause = buildWhereClause.call(this, opts, rest);
  this.whereClause = this.whereClause.plus(clause);
  return this;
}

/**
 * Replace all existing WHERE conditions with new ones.
 *
 * Mirrors: ActiveRecord::QueryMethods#rewhere (query_methods.rb:1061-1071)
 */
function rewhere(this: QueryMethodsHost, conditions: Record<string, unknown> | null): any {
  // Mirrors rewhere (query_methods.rb): `return unscope(:where) if conditions.nil?`.
  if (conditions == null) return unscope.call(this, "where");
  conditions = sanitizeForbiddenAttributes(conditions);
  const rel = this.spawn();
  // Mirrors rewhere (query_methods.rb): `where_clause = build_where_clause(...)`,
  // `unscope!(where: where_clause.extract_attributes)`, `where_clause += ...`.
  // Building through the same `build_where_clause` path as `where` keeps the
  // predicates separate (so a polymorphic `belongs_to` key like `writer`
  // expands to distinct `writer_type`/`writer_id` predicates), and excepting by
  // the *columns the new predicates reference* — not the hash keys — drops both
  // of those columns before re-adding them.
  const newClause = buildWhereClause.call(rel, conditions);
  rel.whereClause = rel.whereClause.except(...newClause.extractAttributes());
  rel.whereClause = rel.whereClause.plus(newClause);
  return rel;
}

/**
 * True for values that PredicateBuilder will route through its
 * RelationHandler (subquery IN/NOT IN). Mirrors the shape check in
 * `PredicateBuilder#isRelation`: a Relation exposes `_model` and a
 * `toArel()` method.
 */
function isRelationLike(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "_model" in value &&
    typeof (value as { toArel?: unknown }).toArel === "function"
  );
}

/**
 * Invert all existing WHERE conditions.
 * Swaps where ↔ where.not clauses.
 *
 * Mirrors: ActiveRecord::QueryMethods#invert_where (query_methods.rb:1101-1103)
 */
function invertWhere(this: QueryMethodsHost): any {
  return invertWhereBang.call(this.spawn());
}

function invertWhereBang(this: QueryMethodsHost): any {
  this.whereClause = this.whereClause.invert();
  return this;
}

/**
 * Build an Error tagged with `name = "ArgumentError"` so callers can
 * catch it the same way they would catch Rails' ArgumentError
 * (`catch err if err.name === 'ArgumentError'`). Exported so other
 * modules (PredicateBuilder, Relation public methods, Base.where /
 * WhereChain#not, etc.) can raise the same shape without
 * re-declaring the helper.
 */
export function argumentError(message: string): Error {
  const err = new Error(message);
  err.name = "ArgumentError";
  return err;
}

/**
 * Structural deep equality used by and!/or! compatibility checks.
 *
 * Handles primitives via ===, arrays element-wise, Date via getTime,
 * plain objects key-wise, and class instances by delegating to an `eql`
 * method (Arel nodes) or an `equals` method when available. Non-plain
 * objects without a comparator are considered incompatible unless they
 * are the same reference — falling back to enumerable-key comparison
 * would incorrectly treat e.g. `new Date(0)` and `new Date(1)` as equal
 * since their internal state is not enumerable.
 */
/** Order-preserving uniq using {@link deepEqual} (mirrors Ruby `Array#uniq`). */
function uniqArray(arr: unknown[]): unknown[] {
  const out: unknown[] = [];
  for (const el of arr) {
    if (!out.some((seen) => deepEqual(seen, el))) out.push(el);
  }
  return out;
}

/**
 * Ruby `Array#|=` (and `uniq`) dedup by `eql?`/`hash` — structural for Hash
 * specs, strings, and Arel nodes alike (Arel::Nodes::Binary, which Join extends,
 * defines eql?/hash by class + members: arel/nodes/binary.rb:20-29). This mirrors
 * that for the join-value unions (`joins_values`, `left_outer_joins_values`):
 * {@link deepEqual} tests `===` first, then delegates to a node's own `eql`, and
 * falls back to per-key structural equality for plain-object specs — so
 * `leftJoins({ ":posts": "x" })` called twice folds to one entry as in Rails.
 * @internal
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
  // (structurallyIncompatibleValuesFor). Caller-supplied JS Date values
  // compare by epoch since Object.is treats distinct Date instances as unequal.
  // Use Object.is on the epoch so two invalid (NaN) Dates compare equal too.
  if (a instanceof Date) return b instanceof Date && Object.is(a.getTime(), b.getTime());
  // boundary: paired with the `a instanceof Date` branch above.
  if (b instanceof Date) return false;

  // boundary: every caller here is a Ruby `Array#|` union or a `Hash#eql?`
  // comparison, both of which dispatch `eql?` — never `==`. `Relation` defines
  // only `==` (relation.rb:1253) and inherits `Object#eql?`, so two distinct
  // Relations are NOT eql? and `with(a: relX).with(a: relY)` keeps both entries,
  // as `with_values |= args` does. The async guard is what enforces that here:
  // trails' `Relation#equals` is async, and an unawaited `Promise` is truthy,
  // so consulting it would report every pair of Relations equal. Same `async`
  // convention `Object#blank?` relies on (core_ext/object/blank.rb:19).
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

/**
 * Mirrors: ActiveRecord::QueryMethods::STRUCTURAL_VALUE_METHODS
 * (query_methods.rb:2261-2264) — `Relation::VALUE_METHODS - [:extending, :where,
 * :having, :unscope, :references, :annotate, :optimizer_hints]`.
 */
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

/**
 * Mirrors: ActiveRecord::QueryMethods#structurally_incompatible_values_for
 * (query_methods.rb:2266-2277) — compare `@values[method]` on both sides,
 * treating a non-Array on the other side as compatible and comparing Arrays
 * after `uniq`.
 * @internal
 */
export function structurallyIncompatibleValuesFor(
  this: QueryMethodsHost,
  other: QueryMethodsHost,
): string[] {
  const values = other._values;
  // Ruby `Array#reject` is core Enumerable, whose faithful JS spelling is
  // `filter` over the negated block — so Rails' `next true` (rejected, i.e.
  // compatible) is `return false` here, and its trailing `v1 == v2` is the
  // negated `deepEqual`.
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
      // Rails uses `other.class.name`; a plain object maps to Ruby's Hash,
      // but a class instance should report its own constructor name.
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

/**
 * Returns true if `self` and `other` are structurally compatible for
 * and!/or! combining — exposed as a helper so Relation#structurally_compatible?
 * can share the same check.
 */
export function areStructurallyCompatible(self: unknown, other: unknown): boolean {
  if (!isRelationForCombining(self) || !isRelationForCombining(other)) return false;
  return structurallyIncompatibleValuesFor.call(self, other).length === 0;
}

/**
 * Check if another relation is structurally compatible for use with and()/or().
 *
 * Mirrors: ActiveRecord::QueryMethods#structurally_compatible?
 * (query_methods.rb:1121-1123)
 */
function structurallyCompatible(this: QueryMethodsHost, other: any): boolean {
  return structurallyIncompatibleValuesFor.call(this, other).length === 0;
}

/**
 * Combine this relation with another using AND — merges all WHERE
 * conditions from the other relation into this one.
 *
 * Mirrors: ActiveRecord::QueryMethods#and (query_methods.rb:1135-1141)
 */
function and(this: QueryMethodsHost, other: any): any {
  return andBang.call(this.spawn(), other);
}

function andBang(this: QueryMethodsHost, other: any): any {
  assertRelationForCombining(other, "and");
  assertStructurallyCompatible(this, other, "and");
  // Mirrors Rails: where_clause |= other.where_clause;
  //                having_clause |= other.having_clause;
  //                references_values |= other.references_values
  this.whereClause = this.whereClause.union(other.whereClause);
  this.havingClause = this.havingClause.union(other.havingClause);
  this.referencesValues = unionReferences(this.referencesValues, other.referencesValues);
  return this;
}

/**
 * Combine this relation with another using OR.
 *
 * Mirrors: ActiveRecord::QueryMethods#or (query_methods.rb:1167-1177)
 */
function or(this: QueryMethodsHost, other: any): any {
  // query_methods.rb:1168 — the `other.is_a?(Relation)` guard wraps BOTH arms,
  // so `none.or(garbage)` raises rather than reaching `other.spawn`.
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

/**
 * Add HAVING clause. Accepts raw SQL string (with optional bind values),
 * a hash of column/value pairs, or an Arel node.
 *
 * Mirrors: ActiveRecord::QueryMethods#having (query_methods.rb:1197-1199)
 */
function having(
  this: QueryMethodsHost,
  opts: string | Record<string, unknown> | Nodes.Node,
  ...rest: unknown[]
): any {
  // `opts.blank? ? self : spawn.having!(opts, *rest)` (query_methods.rb:1198) —
  // a blank condition (an empty hash included) is a no-op on the receiver, so it
  // never reaches PredicateBuilder, which expands `{}` to the `1=0` contradiction.
  if (opts == null || isBlankArgument(opts)) return this;
  return havingBang.call(this.spawn(), opts, ...rest);
}

function havingBang(
  this: QueryMethodsHost,
  opts: string | Record<string, unknown> | Nodes.Node,
  ...rest: unknown[]
): any {
  // `self.having_clause += build_having_clause(opts, rest)` (query_methods.rb:1202).
  this.havingClause = this.havingClause.plus(buildWhereClause.call(this, opts, rest));
  return this;
}

/**
 * Set LIMIT.
 *
 * Mirrors: ActiveRecord::QueryMethods#limit (query_methods.rb:1211-1213)
 */
function limit(this: QueryMethodsHost, value: number | string | null): any {
  return limitBang.call(this.spawn(), value);
}

function limitBang(this: QueryMethodsHost, value: number | string | null): any {
  // Mirrors `limit!` (query_methods.rb:1215-1218): the raw value is stored and
  // sanitized later, by `build_arel`'s `connection.sanitize_limit` (:1757).
  this.limitValue = value;
  return this;
}

/**
 * Set OFFSET.
 *
 * Mirrors: ActiveRecord::QueryMethods#offset (query_methods.rb:1227-1229)
 */
function offset(this: QueryMethodsHost, value: number | string | null): any {
  return offsetBang.call(this.spawn(), value);
}

function offsetBang(this: QueryMethodsHost, value: number | string | null): any {
  // Mirrors `offset!` (query_methods.rb:1231-1234): the raw value is stored and
  // integer-coerced later, by `build_arel`'s `offset_value.to_i` (:1758).
  this.offsetValue = value;
  return this;
}

/**
 * Add a lock clause (FOR UPDATE by default).
 *
 * Mirrors: ActiveRecord::QueryMethods#lock (query_methods.rb:1238-1240)
 */
function lock(this: QueryMethodsHost, locks: string | boolean | null = true): any {
  return lockBang.call(this.spawn(), locks);
}

/**
 * Mirrors: ActiveRecord::QueryMethods#lock! (query_methods.rb:1242-1249) — the
 * argument itself is stored, so a bare `lock` leaves `lockValue === true` and
 * `lock(false)` leaves it `false`. The `FOR UPDATE` default is Arel's, applied
 * by `SelectManager#lock` (select_manager.rb:52-59), not by this writer.
 */
function lockBang(this: QueryMethodsHost, locks: string | boolean | null = true): any {
  if (typeof locks === "string" || locks === true || locks == null) {
    // Ruby `locks || true`: only `nil` falls through to `true` here, since
    // `false` never reaches this arm.
    this.lockValue = locks ?? true;
  } else {
    this.lockValue = false;
  }
  return this;
}

/**
 * Returns a relation that will always produce an empty result.
 *
 * Mirrors: ActiveRecord::QueryMethods#none (query_methods.rb:1281-1283)
 */
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

/**
 * Mirrors: ActiveRecord::QueryMethods#null_relation? (query_methods.rb:1293) —
 * `@none`.
 *
 * This is also the single none-short-circuit chokepoint consulted by every
 * query terminal (`toArray`/`exists`/`pluck`/`count`/the bounded finders) and
 * by the mutation terminals (`updateAll`/`deleteAll`) BEFORE returning an empty
 * result. `AssociationRelation` overrides it to first rebase a stale new-owner
 * `1=0` seed onto the live association scope, so a relation spawned off a new
 * owner (`owner.things.where(...)`) resolves the persisted FK once the owner is
 * saved.
 */
function isNullRelation(this: QueryMethodsHost): boolean {
  return this._isNone;
}

/**
 * Mark loaded records as readonly.
 *
 * Mirrors: ActiveRecord::QueryMethods#readonly (query_methods.rb:1309-1311)
 */
function readonly(this: QueryMethodsHost, value = true): any {
  return readonlyBang.call(this.spawn(), value);
}

function readonlyBang(this: QueryMethodsHost, value = true): any {
  this.readonlyValue = value;
  return this;
}

/**
 * Enable strict loading — lazily-loaded associations will raise.
 *
 * Mirrors: ActiveRecord::QueryMethods#strict_loading (query_methods.rb:1324-1326)
 */
function strictLoading(this: QueryMethodsHost, value = true): any {
  return strictLoadingBang.call(this.spawn(), value);
}

function strictLoadingBang(this: QueryMethodsHost, value = true): any {
  this.strictLoadingValue = value;
  return this;
}

/**
 * Set default attributes for create operations on this relation.
 *
 * Mirrors: ActiveRecord::QueryMethods#create_with (query_methods.rb:1346-1348)
 */
function createWith(this: QueryMethodsHost, value: Record<string, unknown> | null): any {
  return createWithBang.call(this.spawn(), value);
}

function createWithBang(this: QueryMethodsHost, value: Record<string, unknown> | null): any {
  if (value) {
    // Mirrors create_with! (query_methods.rb:1352): forbid un-permitted params.
    value = sanitizeForbiddenAttributes(value);
    this.createWithValue = { ...this.createWithValue, ...value };
  } else {
    this.createWithValue = {};
  }
  return this;
}

/**
 * Change the FROM clause (for subqueries or alternate table names).
 *
 * Mirrors: ActiveRecord::QueryMethods#from (query_methods.rb:1391-1393)
 */
function from(this: QueryMethodsHost, value: any, subqueryName?: string): any {
  return fromBang.call(this.spawn(), value, subqueryName);
}

function fromBang(this: QueryMethodsHost, value: any, subqueryName?: string): any {
  this.fromClause = new FromClause(value ?? null, subqueryName ?? null);
  return this;
}

/**
 * Make the query DISTINCT.
 *
 * Mirrors: ActiveRecord::QueryMethods#distinct (query_methods.rb:1410-1412)
 */
function distinct(this: QueryMethodsHost, value = true): any {
  return distinctBang.call(this.spawn(), value);
}

function distinctBang(this: QueryMethodsHost, value = true): any {
  this.distinctValue = value;
  return this;
}

/**
 * Add custom methods to this relation instance.
 * Accepts an object with methods, or a function that receives the relation.
 *
 * Mirrors: ActiveRecord::QueryMethods#extending (query_methods.rb:1456-1462)
 */
function extending(
  this: QueryMethodsHost,
  mod?: Record<string, (...args: any[]) => any> | ((rel: any) => void),
): any {
  if (!mod) return this;
  return extendingBang.call(this.spawn(), mod);
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
      // Bind extension methods to the scope-proxy-wrapped relation, not the
      // raw one, so a bare named-scope call inside an extension body (Rails'
      // `has_many :comments do; def newest; created.last; end; end`) resolves
      // through the same method_missing/scope delegation as `rel.created`.
      const wrapped = wrapWithScopeProxy(this);
      for (const [name, fn] of Object.entries(mod)) {
        (this as any)[name] = fn.bind(wrapped);
      }
    }
  }
  return this;
}

/**
 * Add optimizer hints to the query.
 *
 * Mirrors: ActiveRecord::QueryMethods#optimizer_hints (query_methods.rb:1485-1488)
 */
function optimizerHints(this: QueryMethodsHost, ...args: string[]): any {
  checkIfMethodHasArgumentsBang.call(this, ":optimizer_hints", args);
  return optimizerHintsBang.apply(this.spawn(), args);
}

function optimizerHintsBang(this: QueryMethodsHost, ...args: string[]): any {
  // `self.optimizer_hints_values |= args` (query_methods.rb:1490-1493) — a
  // union, so a hint already present is not repeated.
  this.optimizerHintsValues = [...new Set([...this.optimizerHintsValues, ...args])];
  return this;
}

/**
 * Reverse the existing order.
 *
 * Mirrors: ActiveRecord::QueryMethods#reverse_order (query_methods.rb:1498-1500)
 */
function reverseOrder(this: QueryMethodsHost): any {
  return reverseOrderBang.call(this.spawn());
}

function reverseOrderBang(this: QueryMethodsHost): any {
  // Rails hands the whole (compact_blank'd) order list to reverse_sql_order, so an
  // empty order falls into its default branch: ORDER BY <pk> DESC, or an
  // IrreversibleOrderError when the table has no primary key. Mapping over the
  // clauses here skips that branch entirely, so delegate the empty case.
  // Rails' compact_blank is reject(&:blank?). activesupport's isBlank is not a
  // substitute here: it reports a key-less object as blank, but Ruby's blank? is
  // false for an Arel node (it has no #empty?), so routing clauses through it
  // would drop every Ordering. Only nil/blank-string clauses are blank in this
  // list; Arel nodes never are.
  const clauses = this.orderValues.filter(
    (clause) => clause != null && !(typeof clause === "string" && /^\s*$/.test(clause)),
  );
  if (clauses.length === 0) {
    this.orderValues = reverseSqlOrder.call(this, []) as typeof this.orderValues;
    return this;
  }
  this.orderValues = clauses.map((clause) => {
    if (clause instanceof Nodes.Node) {
      // Arel::Nodes::SqlLiteral is a String subclass in Rails, so reverse_sql_order
      // reverses it via the `when String` branch (flip trailing ASC↔DESC), not .desc.
      if (clause instanceof Nodes.SqlLiteral) {
        const raw = String((clause as any).value ?? "").trim();
        if (isDoesNotSupportReverse(raw)) {
          throw new IrreversibleOrderError(
            `Order ${JSON.stringify(raw)} cannot be reversed automatically`,
          );
        }
        // Mirror Rails' String branch: split comma-separated terms and flip each
        // via `gsub(asc) || gsub(desc) || (s << " DESC")` (mutually exclusive).
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
      // Mirrors Rails reverse_sql_order: flip Arel::Nodes::Ordering subclasses
      // (Ascending/Descending/NullsFirst/NullsLast) via reverse(), and fall back
      // to desc() for bare expressions (Attribute, NodeExpression).
      if (typeof (clause as any).reverse === "function") return (clause as any).reverse();
      if (typeof (clause as any).desc === "function") return (clause as any).desc();
      return clause;
    }
    // A string order arg stays bare (Rails leaves String args unchanged in
    // order_values), so reversing it mirrors reverse_sql_order's String branch:
    // split on comma and flip each term's trailing ASC↔DESC (appending DESC when
    // unmarked). reverseSqlOrder runs isDoesNotSupportReverse (the faithful port
    // of does_not_support_reverse?), so unbalanced-paren sections and
    // "nulls first/last" still raise.
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

/**
 * Add SQL comments to the query.
 *
 * Mirrors: ActiveRecord::QueryMethods#annotate (query_methods.rb:1529-1532)
 */
function annotate(this: QueryMethodsHost, ...args: string[]): any {
  checkIfMethodHasArgumentsBang.call(this, ":annotate", args);
  return annotateBang.apply(this.spawn(), args);
}

function annotateBang(this: QueryMethodsHost, ...comments: string[]): any {
  this.annotateValues = [...this.annotateValues, ...comments];
  return this;
}

/**
 * Mirrors: ActiveRecord::QueryMethods#uniq! (query_methods.rb:1541-1546) —
 * `if values = @values[name]` then `values.uniq! if values.is_a?(Array) && !values.empty?`.
 */
function uniqBang(this: QueryMethodsHost, name?: string): any {
  if (name === undefined) return this;
  const values = this._values[name];
  if (Array.isArray(values) && values.length > 0) {
    this._values[name] = [...new Set(values)];
  }
  return this;
}

/**
 * Exclude specific records from the result.
 *
 * Mirrors: ActiveRecord::QueryMethods#excluding (query_methods.rb:1574-1584)
 * and `alias :without :excluding` (query_methods.rb:1585). Ruby writes ONE
 * body and lets `__callee__` (:1580) name whichever alias was invoked;
 * TypeScript has no `__callee__` and a shared prototype function cannot
 * recover the name it was reached under, so the one authored body lives in
 * {@link excludingWithCallee} and each name is bound to a copy of it
 * generated with its own callee — the ArgumentError then names `#excluding`
 * or `#without` exactly as `excluding_test.rb:103-110`
 * (`test_raises_on_record_from_different_class`) asserts, with no shared
 * helper Rails does not have.
 */
function excludingWithCallee(callee: "excluding" | "without") {
  return function (this: QueryMethodsHost, ...records: unknown[]): any {
    // Rails `records.extract! { |element| element.is_a?(Relation) }`. The
    // `Relation` constant itself is unreachable from here — importing it would
    // close the relation.ts ↔ query-methods.ts cycle — so the same partition
    // runs off the structural relation check this file already uses for
    // `#and` / `#or`.
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

    // Rails `records + relations.flat_map(&:ids)`. `Relation#ids` returns the
    // cached `records.map(&:id)` when the relation is loaded (calculations.rb:371)
    // and re-queries otherwise. A loaded relation's records are already in
    // memory, so spread them into the literal `records` collection to match
    // Rails exactly (no extra query). An unloaded relation is deferred:
    // `excludingBang` records a marker that the load pipeline materializes into a
    // literal `id NOT IN (1, 2, 3)` via `Relation#ids` (a separate id-select),
    // matching Rails' eager `flat_map(&:ids)` rather than emitting a subquery.
    const combined: unknown[] = [...records];
    for (const relation of relations) {
      if (relation.isLoaded) combined.push(...relation._records);
      else combined.push(relation);
    }
    return excludingBang.call(this.spawn(), combined);
  };
}

const excluding = excludingWithCallee("excluding");

/** Mirrors `alias :without :excluding` (query_methods.rb:1585). */
const without = excludingWithCallee("without");

function excludingBang(this: QueryMethodsHost, records: any[]): any {
  const primaryKey = this.primaryKey;
  if (Array.isArray(primaryKey)) {
    throw new Error("excluding does not support models with composite primary keys");
  }
  const pk = primaryKey;

  // Rails `excluding!`: `predicate_builder[primary_key, records].invert`, where
  // `records` is `records + relations.flat_map(&:ids)` — scalar AR records plus
  // every relation arg's eagerly-materialized ids — built into ONE predicate.
  // Ruby materializes those ids before this call (synchronous query execution);
  // trails' builder is synchronous-and-lazy, so `excluding`/`without` leave any
  // UNLOADED relation in `records` for us to defer here.
  const unloadedRelations = records.filter((r) => isRelationLike(r));
  const literalRecords = records.filter((r) => !isRelationLike(r));

  // No unloaded relations: every value's id is known now, so build the literal
  // predicate exactly as Rails does (array handler dereferences AR records to
  // their ids).
  if (unloadedRelations.length === 0) {
    // Rails `predicate_builder[primary_key, records].invert` — `#[]` reads the
    // attribute straight off the builder's arel table (predicate_builder.rb:53-55).
    this.whereClause = this.whereClause.plus(
      new WhereClause([
        this.predicateBuilder
          .build(this.predicateBuilder.table.arelTable.get(pk), literalRecords)
          .invert(),
      ]),
    );
    return this;
  }

  // Otherwise record a single `DeferredIdsNotIn` carrying both the known literal
  // record ids and the unloaded relations. trails cannot run their id-select
  // synchronously, so the load pipeline materializes `relations.flat_map(&:ids)`
  // and substitutes one literal `id NOT IN (records + relIds)` before compile —
  // matching Rails' single predicate and its extra-query-per-relation semantics
  // rather than emitting a `NOT IN (SELECT ...)` subquery. Folding the literals
  // into the same marker keeps it ONE predicate, not an `AND` of `NOT IN`s. The
  // marker carries a pk-select subquery only as a `toSql()` display fallback for
  // the (rare) no-load path; eager materialization here would require an async
  // `excluding`, breaking the chainable contract.
  const attribute = this.predicateBuilder.table.arelTable.get(pk);
  const literalIds = literalRecords.map((r) => (isBaseInstance(r) ? (r as any).id : r));
  // Build the positive `IN (subquery)` (Rails builds positively and inverts);
  // only its subquery `right` is needed for the marker's display fallback.
  const inlineSubquery = (this.predicateBuilder.build(attribute, unloadedRelations[0]) as Nodes.In)
    .right as Nodes.Node;
  this.whereClause = this.whereClause.plus(
    new WhereClause([
      new DeferredIdsNotIn(attribute, inlineSubquery, literalIds, unloadedRelations),
    ]),
  );
  return this;
}

/**
 * Returns the Arel object associated with the relation. `aliases` threads an
 * existing AliasTracker so a join scope built via `arel` re-aliases tables
 * already claimed by the caller.
 *
 * Mirrors: ActiveRecord::QueryMethods#arel (query_methods.rb:1594-1596)
 * @internal
 *
 * @missingRailsCall build_arel — CONVERGEABLE: Surfaced by the relation.ts →
 *   relation/query-methods.ts split (RFC 0107): `arel` and `toArel` are now
 *   cross-file, so the call-set comparer can no longer see through the
 *   delegation to the `build_arel` call inside `toArel`. Folding the memo,
 *   connection acquisition and build_arel call back into `arel` itself is
 *   tracked by story fold-to-arel-into-the-arel-reader (RFC 0107).
 * @missingRailsCall with_connection — CONVERGEABLE: Relation#arel's memo, connection
 *   acquisition and build_arel call all live in `toArel`, which this body
 *   delegates to verbatim; folding them back into `arel` is tracked by story
 *   fold-to-arel-into-the-arel-reader (RFC 0107). Row moved verbatim from
 *   relation.ts with the member (RFC 0107 fan-out).
 */
export function arel(this: QueryMethodsHost, aliases?: AliasTracker): any {
  return this.toArel(aliases);
}

/**
 * Mirrors: ActiveRecord::QueryMethods#construct_join_dependency
 * (query_methods.rb:1598).
 * @internal
 */
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

// ---------------------------------------------------------------------------
// Private helpers — mirrors ActiveRecord::QueryMethods private block.
// Most stay non-exported so the extractor marks them internal: true.
// A handful are exported (assertModifiableBang, checkIfMethodHasArgumentsBang,
// isTableNameMatches, arelColumn{,s,WithTable,sFromHash}) so Relation can
// wire them as instance methods without re-implementing the bodies; they
// keep `@internal` JSDoc so TypeDoc + the rails-private-jsdoc lint rule
// continue to treat them as Rails-private.
// ---------------------------------------------------------------------------

/** @internal */
function asyncBang(this: QueryMethodsHost): QueryMethodsHost {
  (this as any)._async = true;
  return this;
}

/** Mirrors: ActiveRecord::QueryMethods#async (query_methods.rb:1678-1680). @internal */
export function async(this: QueryMethodsHost): QueryMethodsHost {
  return asyncBang.call((this as any).spawn());
}

/** @internal */
export function assertModifiableBang(this: QueryMethodsHost): void {
  if ((this as any)._loaded) {
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

/**
 * Mirrors `Relation#check_if_method_has_arguments!`
 * (query_methods.rb:2213-2222). `methodName` is Rails' `__callee__` Symbol,
 * spelled with its leading colon; interpolating a Symbol renders its name, so
 * the message drops the colon.
 * @internal
 */
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

    // Ruby `args.flatten!` (query_methods.rb:2219) — nested ARRAYS only, so
    // `with({ cte: rel })` keeps its CTE definition hash intact; this is not
    // `flattened_args`, which also flattens hashes.
    const flat = args.flat(Infinity);
    args.length = 0;
    for (const a of flat) {
      if (!isBlankArgument(a)) args.push(a);
    }
  }
}

/**
 * Mirrors: ActiveRecord::QueryMethods#flattened_args (query_methods.rb:2077-2079)
 * — `args.flat_map { |e| (e.is_a?(Hash) || e.is_a?(Array)) ? flattened_args(e.to_a) : e }`.
 * A Hash flattens through `to_a`, so both its keys and its VALUES reach the
 * caller (`disallow_raw_sql!` checks the direction as well as the column).
 * A `Map` is the Ruby-Hash analogue for keys JS objects cannot hold.
 * @internal
 */
export function flattenedArgs(args: unknown[]): unknown[] {
  return args.flatMap((e) =>
    isPlainObject(e) || e instanceof Map || Array.isArray(e) ? flattenedArgs(toA(e)) : e,
  );
}

/** Ruby `Hash#to_a` / `Array#to_a`: a Hash becomes its `[key, value]` pairs. */
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

/** Ruby `Object#to_i` semantics: nil → 0, leading-integer parse otherwise. */
/** @internal */
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
 * Normalize a bind value before handing it to `BoundSqlLiteral`. Mirrors the
 * `ActiveRecord::Relation === value` branch of Rails' `build_bound_sql_literal`
 * / `build_named_bound_sql_literal` (query_methods.rb): a Relation is inlined as
 * `Arel.sql(value.to_sql)` so `where("id IN (?)", SomeRelation)` produces a
 * subquery rather than reaching `visitBindValue`'s `quote()`. Arel nodes are
 * rendered to SQL the same way (trails passes nodes here where Rails would not).
 * @internal
 */
export function normalizeBoundValue(this: QueryMethodsHost, value: unknown): unknown {
  if (value instanceof Nodes.Node) {
    return Arel.sql(connectionFor(this._model).toSql(value));
  }
  if (isRelationLike(value)) {
    return Arel.sql((value as { toSql(): string }).toSql());
  }
  // Mirrors the array / id_for_database transforms in build_bound_sql_literal /
  // build_named_bound_sql_literal (query_methods.rb:1686-1715): a collection
  // maps id_for_database over its elements (empty → nil), and a scalar AR object
  // is reduced to its id_for_database. The visitor's cast_bound_value + quote
  // run later, at render time. (Array/Set only, matching `quoteBoundValue` in
  // sanitization.ts rather than every `respond_to?(:map)` iterable.)
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
    return new Nodes.BoundSqlLiteral(`(${statement})`, [], namedBinds);
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
    return new Nodes.BoundSqlLiteral(`(${statement})`, positionalBinds, {});
  } catch (e: any) {
    throw new PreparedStatementInvalid(e?.message ?? String(e), { cause: e });
  }
}

/**
 * @internal
 *
 * @missingRailsCall arel — CONVERGEABLE: Confirmed equivalent (RFC 0047): the TS body builds
 *   the Arel manager via _buildArel/toArel (the build_arel port that arel()
 *   delegates to) rather than the memoized arel reader; surfaced when arel()
 *   gained its Rails-faithful aliases param (query_methods.rb:1594). See PR
 *   #4518. Tracked by story query-methods-order-only-call-inversions (RFC
 *   0106).
 * @missingRailsCall empty? — PERMANENT: Verified per-site (RFC 0106):
 *   `optimizer_hints_values.empty?` (query_methods.rb:1609) — `empty?` on a Ruby
 *   Array, whose faithful JS spelling is `xs.length === 0`. That emits no
 *   callee, so no TS call can ever credit the Ruby one. The gate flags it only
 *   because `empty?` maps onto the unrelated `ActiveRecord::Result.empty`, which
 *   takes arguments since it gained Rails' `async:` kwarg (result.rb:94-100) —
 *   nothing in the TS body was dropped.
 */
export function buildSubquery(
  this: QueryMethodsHost,
  subqueryAlias: string,
  selectValue: unknown,
): SelectManager {
  // query_methods.rb:1606: `except(:optimizer_hints).arel.as(subquery_alias)`.
  const relation =
    typeof (this as any).except === "function" ? (this as any).except("optimizerHints") : this;
  if (typeof relation.toArel !== "function") {
    throw new ActiveRecordError("Cannot build subquery: relation does not support toArel()");
  }
  // No identifier gate — the alias is caller-trusted and wrapped verbatim in a
  // `SqlLiteral` by `SelectManager#as`, matching Rails' `build_from`.
  const subquery = relation.toArel().as(subqueryAlias);
  const sm = new SelectManager(subquery);
  sm.project(selectValue as any);
  const hints: string[] = (this as any).optimizerHintsValues ?? [];
  if (hints.length > 0) sm.optimizerHints(...hints);
  return sm;
}

/**
 * @internal
 *
 * @missingRailsCall new — PERMANENT: Verified per-site (RFC 0106): `String.new(order)
 *   unless order.instance_of?(String)` (query_methods.rb:2047) exists only to
 *   shed a String SUBCLASS's method overrides (Arel::Nodes::SqlLiteral#count).
 *   JS has no String subclassing to shed, so the port is the plain
 *   `String(order)` coercion (query-methods.ts:2395).
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
    // Rails guards on `if primary_key` alone: a composite primary key is an
    // Array, which is truthy, so it takes the same `table[primary_key].desc`
    // path as a scalar one. The raise is reserved for a nil primary key.
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
export function extractTableNameFrom(orderTerm: string): string | null {
  const match = orderTerm.match(/^\W?(\w+)\W?\./);
  return match ? match[1] : null;
}

/**
 * Ruby `x.is_a?(Symbol)`. A Ruby Symbol is a JS string carrying its leading
 * colon (CLAUDE.md) — `:bar` is `":bar"` — so the colon is the discriminator
 * the Ruby side gets from the type. Rails turns on it at
 * query_methods.rb:1980 (`column_name.is_a?(Symbol) || !column_name.match?(/\W/)`)
 * and :2003 (`Arel.sql(is_symbol ? quote_table_name(field) : field)`).
 */
function isRubySymbol(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(":");
}

/** Ruby `Symbol#name`. */
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
      // `order([...])` passes a single array; Rails splats order args, so flatten
      // here too — otherwise a qualified column inside the array (e.g.
      // `order(["comments.body", ...])`) never registers its table reference and
      // an `includes` it names is not promoted to `eager_load`.
      refs.push(...columnReferences(arg).map((ref) => ref.value));
    } else if (typeof arg === "string") {
      const term = isRubySymbol(arg) ? symbolToName(arg) : arg;
      const t = extractTableNameFrom(term);
      if (t) refs.push(t);
    } else if (arg instanceof Nodes.Attribute) {
      refs.push(relationName(arg.relation.name));
    } else if (arg instanceof Nodes.Ordering) {
      const expr = (arg as any).expr;
      if (expr instanceof Nodes.Attribute) {
        refs.push(relationName(expr.relation.name));
      }
    } else if (arg instanceof Map) {
      // Rails' Hash arm extracts a table only from String/Symbol keys; an Arel
      // key with a scalar direction falls through to nil, so `order(node => dir)`
      // never promotes an includes to eager_load.
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
  // `.filter_map { |ref| Arel.sql(ref, retryable: true) if ref }`
  // (query_methods.rb:2146) — the references order args imply are SqlLiterals,
  // which is what lets an order like `order(author: { name: :asc })` alias the
  // eager-load join to `author` (join_dependency.rb:90-92, :202).
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
  // disallowRawSqlBang's Symbol skip tests `typeof arg === "symbol"`, which a
  // trails Ruby Symbol (a ":name" string) never is — resolve symbol names to
  // strings first so their descriptions, not their leading colons, are what the
  // column-name matcher sees.
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
      // JS object keys can't be Arel nodes, so a Map is the analogue of Rails'
      // `order(node => :desc)` — the `when Arel::Nodes::Node` branch, which
      // sends the direction to the key itself instead of resolving it.
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
    node.when((column as any).eq(value), i + 1);
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

/**
 * `QueryMethods.public_instance_methods(false)` — the members Ruby defines
 * above the first `protected` (query_methods.rb:1604). `CollectionProxy`
 * delegates exactly this set to `scope` (collection_proxy.rb:1128-1137), so
 * the boundary is a fact about this module and is expressed here rather than
 * transcribed there.
 *
 * @internal
 */
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

/**
 * The members in query_methods.rb's two `protected` sections
 * (query_methods.rb:1604 and query_methods.rb:1663, the second running to
 * `private` at query_methods.rb:1677). Ruby excludes `protected` members from
 * `public_instance_methods(false)` exactly as it excludes private ones, so
 * `CollectionProxy` delegates none of them to `scope`
 * (collection_proxy.rb:1128-1137); they ride the same mixin here so
 * `relation.ts` does not redeclare a second copy.
 *
 * @internal
 */
export const QueryMethodsProtectedInstanceMethods = {
  // query_methods.rb:1604 (`protected`).
  buildSubquery,
  buildWhereClause,
  // Mirrors `alias :build_having_clause :build_where_clause`
  // (query_methods.rb:1654) — HAVING conditions parse identically to WHERE.
  buildHavingClause: buildWhereClause,
  asyncBang,
  // query_methods.rb:1663 (a second `protected` section).
  arelColumns,
} as const;

/**
 * The members below query_methods.rb's `private` (query_methods.rb:1677).
 * Ruby keeps them out of `public_instance_methods(false)`, so they are not
 * delegated; they ride the same mixin here so `relation.ts` does not redeclare
 * a second copy.
 *
 * @internal
 */
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

export const QueryMethodBangs = {
  ...QueryMethodsPublicInstanceMethods,
  ...QueryMethodsProtectedInstanceMethods,
  ...QueryMethodsPrivateInstanceMethods,
} as const;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Resolve the active connection for a model on a relation-build read. Prefers
 * the connection threaded by the enclosing `withConnection` wrap (Rails
 * threads the `with_connection` connection through query building) so the read
 * stays off the deprecated `.connection` getter — which would flip the lease
 * permanent under `permanent_connection_checkout = :deprecated|:disallowed` when
 * a scope is built inside a wrap (eager-load/preload scope construction during
 * `first`/`last`/`find_each`). Falls back to the getter outside a wrap, which
 * lets `Base.connection` propagate its `ConnectionNotDefined` (or other
 * connection errors) so callers see the real cause rather than a `TypeError` on
 * the next `.quote*`/`.toSql` access.
 */
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
  // Mirror Rails: from.to_sql if from.respond_to?(:to_sql)
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
  // Rails: a raw Arel node has no columns_hash/table.column form; it falls to
  // the block, else passes through unchanged (query_methods.rb:1996-2003).
  if (field instanceof Nodes.Node) return fallback ? fallback(field as any) : field;
  // Ruby `field = field.name if is_symbol = field.is_a?(Symbol)` then `field.to_s`
  // (query_methods.rb:1991-1992) — which is what carries `sum`'s Integer identity
  // default through as the literal it sums over, and `async_sum`'s nil one
  // (calculations.rb:182) as `""`, the empty `SUM()`.
  const isSymbol = isRubySymbol(field);
  let fieldStr = isSymbol ? symbolToName(field) : field == null ? "" : String(field);
  fieldStr = modelClass?.attributeAliases?.[fieldStr] ?? fieldStr;

  const fromClause = (this as any).fromClause;
  const from = fromClause?.name || fromClause?.value;

  if (modelClass?.columnsHash?.()[fieldStr] && (!from || isTableNameMatches.call(this, from))) {
    const table: any = this.table;
    return table.get(fieldStr);
  }
  const dotMatch = fieldStr.match(/^(?<table>(?:\w+\.)?\w+)\.(?<column>\w+)$/);
  if (dotMatch) {
    return arelColumnWithTable.call(this, dotMatch.groups!.table, dotMatch.groups!.column);
  }
  if (fallback) return fallback(fieldStr);
  // Ruby `Arel.sql(is_symbol ? quote_table_name(field) : field)`
  // (query_methods.rb:2005): a Symbol names a column and is quoted; a String is
  // raw SQL and is not.
  const quoted = isSymbol ? connectionFor(modelClass).quoteTableName(fieldStr) : fieldStr;
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
  // `self.references_values |= [Arel.sql(table_name, retryable: true)]`
  // (query_methods.rb:1979) — a SqlLiteral reference, which is the only kind
  // JoinDependency seeds its alias map from (join_dependency.rb:90-92).
  (this as any).referencesValues = unionReferences((this as any).referencesValues ?? [], [
    Arel.sql(tableName, { retryable: true }),
  ]);
  // Ruby discriminates `column_name.is_a?(Symbol)` (query_methods.rb:1980): a
  // Symbol names a column, a String may be an expression.
  const isSymbol = isRubySymbol(columnName);
  if (isSymbol) columnName = symbolToName(columnName);
  const modelClass: any = this.model;
  if (isSymbol || !/\W/.test(columnName)) {
    const builder = (this as any).predicateBuilder;
    // Rails passes `lookup_table_klass_from_join_dependencies` as the block
    // (query_methods.rb:1982-1984), so a table name that only resolves through a
    // join dependency still finds its model — and its type caster.
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
 *
 * @missingRailsCall empty? — PERMANENT: Verified per-site (RFC 0106): `group_values.empty?`
 *   (query_methods.rb:2155) — `empty?` on a Ruby Array, whose faithful JS
 *   spelling is `xs.length === 0`. That emits no callee, so no TS call can ever
 *   credit the Ruby one. The gate flags it only because `empty?` maps onto the
 *   unrelated `ActiveRecord::Result.empty`, which takes arguments since it
 *   gained Rails' `async:` kwarg (result.rb:94-100) — nothing in the TS body was
 *   dropped.
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
    // Mirror Rails `check_if_method_has_arguments!` → `compact_blank!`: a nil
    // (null/undefined) select arg is dropped, so `select(null)` clears nothing
    // instead of projecting a literal "null" column.
    if (field === null || field === undefined) return [];
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
  if (opts && typeof opts.toArel === "function") {
    name ??= "subquery";
    const alias = String(name);
    // No identifier gate: Rails' `build_from` stores the caller-provided
    // `subquery_name` verbatim and wraps it in a `SqlLiteral` via
    // `SelectManager#as`, so the alias is caller-trusted. A regex guard here was
    // stricter than Rails and left the two `from(Relation)` paths asymmetric.
    // When the from-value is a Relation that needs eager loading (Rails
    // `opts.eager_loading?`), derive the from clause via
    // `apply_join_dependency` first (Rails build_from). This folds the eager
    // `includes`/`eager_load` into LEFT OUTER JOINs so a WHERE that references
    // the joined table (e.g. `posts.type`) resolves inside the subquery.
    // `applyJoinDependency` clones internally, so the caller's relation
    // is not mutated.
    let resolved: any = opts;
    if (opts.isEagerLoading === true && typeof opts.applyJoinDependency === "function") {
      // `apply_join_dependency` is async in trails (its
      // `distinct_relation_for_primary_key` branch executes a query) while
      // `build_from` (query_methods.rb:1789) is sync. Everything before that
      // query is synchronous, so the block delivers the relation during the
      // call; `resolved` still being `opts` means the query branch WAS entered
      // and a synchronous `from(...)` cannot await it. Raise rather than build
      // the subquery from an un-joined relation.
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
    // Rails build_from wraps `opts.arel.as(name)`, where `arel` is the full
    // `build_arel` — joins, HAVING, nested FROM, LOCK, CTEs, etc. Use the
    // comprehensive builder rather than the projection-only `toArel`, so the
    // subquery stays a live AST: its binds parameterize and its retryability is
    // determined by the actual child nodes (not unconditionally disabled).
    // `build_arel` projects the qualified table star (`"comments".*`) and does
    // NOT run `JoinDependency#apply_column_aliases` — that column-alias
    // projection (`t0_r0…`) is applied only in Rails' `exec_queries`/`to_sql`/
    // `pluck` paths, when the OUTER relation is eager, never in `build_from`.
    // So the folded eager subquery here emits plain star, matching Rails and
    // the where-subquery path (`relation-handler`); this is intentional, not a
    // shape deviation to converge away. See the
    // `eager-from-subquery-column-alias-projection` story.
    return resolved.toArel().as(alias);
  }
  return opts;
}

function tableStar(table: any): unknown {
  return table.star ?? table.get("*");
}

/**
 * Mirror of Rails `Relation#build_select`: project the select list onto the
 * given Arel manager, defaulting to the qualified table star.
 *
 * @internal
 */
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
    // Ruby's `reduce` with no initial value answers `nil` on an empty
    // collection (query_methods.rb:1946-1948); JS's throws `TypeError: Reduce
    // of empty array`. `with(cte: [])` therefore builds a `TableAlias` over a
    // nil relation and fails downstream, exactly where Rails fails.
    if (parts.length === 0) return undefined;
    return parts.reduce(
      (result: unknown, value: unknown) => new Nodes.UnionAll(result as any, value as any),
    );
  }
  throw argumentError(`Unsupported argument type: \`${String(value)}\` ${rubyClassNameOf(value)}`);
}

/**
 * Mirrors: ActiveRecord::QueryMethods#build_with_value_from_hash
 * (query_methods.rb:1923-1927).
 * @internal
 */
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

// Rails passes lookupTableKlassFromJoinDependencies as a block to
// predicate_builder.build_from_hash so a nested-hash key that is a join's table
// name (rather than a direct reflection) resolves to the right model. It is
// wired through buildWhereClause's buildFromHash call above.
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
 *
 * @missingRailsCall empty? — PERMANENT: Verified per-site (RFC 0106):
 *   `eager_load_values.empty?` / `includes_values.empty?`
 *   (query_methods.rb:1737,1738) — `empty?` on a Ruby Array, whose faithful JS
 *   spelling is `xs.length === 0`. That emits no callee, so no TS call can ever
 *   credit the Ruby one. The gate flags it only because `empty?` maps onto the
 *   unrelated `ActiveRecord::Result.empty`, which takes arguments since it
 *   gained Rails' `async:` kwarg (result.rb:94-100) — nothing in the TS body was
 *   dropped.
 */
export function buildJoinDependencies(this: QueryMethodsHost): JoinDependency[] {
  // Mirror Rails build_join_dependencies (query_methods.rb):
  //   joins = joins_values | left_outer_joins_values | eager_load | includes
  //   join_dependencies.unshift construct_join_dependency(select_named_joins(joins, …), nil)
  // i.e. ALL named association joins fold into a single JoinDependency (nil join
  // type, since this set is consulted for table-klass / cast-type lookups, not
  // SQL emission).
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
  // Rails threads the `with_connection` connection into every `build_arel`
  // call (query_methods.rb:1595, relation.rb:1023), so the body never sees a
  // missing one. Callers acquire before calling.
  connection: AbstractAdapter,
  aliases?: AliasTracker,
): any {
  const table: any = this.table;
  const arel = new SelectManager(table);

  buildJoins.call(this, arel, aliases);

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
  // Mirror Rails: partition into CTEJoins (symbols matching a with_value key)
  // vs ordinary association specs.
  const cteJoins: string[] = [];
  const associations: unknown[] = [];

  for (const joinName of joinNames) {
    if (
      isRubySymbol(joinName) &&
      // Rails: `with_values.any? { _1.key?(join_name) }` (query_methods.rb:1800).
      // The store keeps whatever key `with(...)` was called with, and a trails
      // Ruby Symbol is a ":name" string — so `with({ ":x": rel })` and
      // `with({ x: rel })` are the same Ruby `{ x: rel }`. Both arms are that
      // one `key?(join_name)`, not a widened lookup.
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

/**
 * Mirrors `select_association_list` (query_methods.rb:1810-1823).
 *
 * Its `when Hash, Symbol, Array` arm keeps association specs and drops a raw
 * SQL String through the `else`. A Ruby Symbol is a leading-colon string in
 * trails (CLAUDE.md), which is the discriminator the Ruby `when` gets from the
 * type.
 *
 * @internal
 */
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
 * Rails only accepts Symbol/Hash/Array as a left-outer arg — a bare String is
 * not a Symbol, so `left_outer_joins("raw sql")` raises "only Hash, Symbol and
 * Array are allowed" lazily from build_join_buckets' block
 * (query_methods.rb:1830-1836) for anything its `select_association_list`
 * (query_methods.rb:1810-1824) does not recognize as a spec or stash as a
 * JoinDependency. trails collapses Ruby Symbol and String to one JS string
 * type, so an association name and a raw SQL fragment are indistinguishable by
 * type; a raw fragment is a string containing whitespace, which no association
 * identifier has. Reject those (and any other non-spec value) at build time,
 * mirroring Rails' lazy raise point and message. A JoinDependency is allowed
 * through — `select_association_list` stashes it rather than raising.
 *
 * @internal
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
 * Rails' inner `select_named_joins` block (query_methods.rb:1865-1873): an Arel
 * Join node that survived the leading-join loop becomes a join_node
 * unconditionally, a CTEJoin — a `joins()` symbol matching a `with(...)` CTE
 * name — becomes an InnerJoin join_node, and anything else raises a plain
 * RuntimeError `"unknown class: <ClassName>"` (NOT the left-outer bucket's
 * ArgumentError, query_methods.rb:1834). Shared by `buildJoinBuckets` and the
 * live path's `emitJoinPlan`, which partition the same joins_values the same
 * way.
 *
 * @internal
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
 *
 * @missingRailsCall empty? — PERMANENT: Verified per-site (RFC 0106):
 *   `left_outer_joins_values.empty?` / `joins_values.empty?`
 *   (query_methods.rb:1828,1838) — `empty?` on a Ruby Array, whose faithful JS
 *   spelling is `xs.length === 0`. That emits no callee, so no TS call can ever
 *   credit the Ruby one. The gate flags it only because `empty?` maps onto the
 *   unrelated `ActiveRecord::Result.empty`, which takes arguments since it
 *   gained Rails' `async:` kwarg (result.rb:94-100) — nothing in the TS body was
 *   dropped.
 */
export function buildJoinBuckets(
  this: QueryMethodsHost,
): [Record<string, unknown[]>, typeof Nodes.InnerJoin | typeof Nodes.OuterJoin] {
  // query_methods.rb:1826 `Hash.new { |h, k| h[k] = [] }` — JS has no Hash
  // default block, so auto-vivification is a Proxy `get` trap.
  const buckets = new Proxy({} as Record<string, unknown[]>, {
    get(h, k) {
      if (typeof k !== "string") return Reflect.get(h, k);
      return (h[k] ??= []);
    },
  });

  const joinsValues = this.joinsValues;

  // Mirror Rails build_join_buckets (query_methods.rb:1828–1876):
  // When left_outer_joins_values is non-empty, Rails runs select_named_joins on
  // them to build stashed_left_joins. If joins_values is also empty, it returns
  // early with OuterJoin type and named_join populated. Otherwise the left-outer
  // JoinDependency is prepended to stashed_left_joins.
  const leftOuterJoinsValues = this.leftOuterJoinsValues;
  const stashedLeft: JoinDependency[] = [];
  if (leftOuterJoinsValues.length > 0) {
    assertValidLeftOuterJoinsBang(leftOuterJoinsValues);
    // Mirror Rails' block (query_methods.rb:1830-1836): a CTEJoin becomes an
    // OuterJoin join_node; any other non-association value raises.
    const namedLeft = selectNamedJoins.call(this, leftOuterJoinsValues, stashedLeft, (left) => {
      if (left instanceof CTEJoin) {
        buckets.join_node.push(buildWithJoinNode.call(this, left.name, Nodes.OuterJoin));
      } else {
        throw argumentError("only Hash, Symbol and Array are allowed");
      }
    });

    if (joinsValues.length === 0) {
      // query_methods.rb:1838-1842: `if joins_values.empty?`.
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

  // query_methods.rb:1847-1850. The popped JoinDependency is the eager stash
  // `apply_join_dependency` pushed in; a cross-klass merged one fails
  // `base_klass == model` and stays in the stream for `select_named_joins`.
  const joins = [...joinsValues];
  const lastJoinValue = joins[joins.length - 1];
  let stashedEagerLoad: JoinDependency | undefined;
  if (lastJoinValue instanceof JoinDependency) {
    if (lastJoinValue.baseKlass === this.model) {
      joins.pop();
      stashedEagerLoad = lastJoinValue;
    }
  }

  // query_methods.rb:1856-1862: `stashed_eager_load || stashed_left_joins`.
  const hasStashed = Boolean(stashedEagerLoad) || stashedLeft.length > 0;

  // query_methods.rb:1851-1853. A Ruby Symbol is a leading-colon string in
  // trails, so a String join value is one without the colon.
  for (const [i, v] of joins.entries()) {
    if (typeof v === "string" && !v.startsWith(":")) {
      joins[i] = new Nodes.StringJoin(Arel.sql(v.trim()) as any) as Nodes.Join;
    }
  }

  // query_methods.rb:1855-1862: only the LEADING run of Join nodes is shifted
  // off and routed by `hasStashed`; a Join node sitting behind a named join
  // falls through to the `select_named_joins` block below, which buckets it as
  // a join_node unconditionally.
  while (joins[0] instanceof Nodes.Join) {
    const joinNode = joins.shift() as Nodes.Join;
    if (!(joinNode instanceof Nodes.LeadingJoin) && hasStashed) {
      buckets.join_node.push(joinNode);
    } else {
      buckets.leading_join.push(joinNode);
    }
  }

  // query_methods.rb:1864-1873.
  const innerJoinNodes: Nodes.Join[] = [];
  buckets.named_join.push(
    ...selectInnerNamedJoins.call(this, joins, buckets.stashed_join, innerJoinNodes),
  );
  buckets.join_node.push(...innerJoinNodes);

  // query_methods.rb:1875-1876 — the eager stash goes in LAST.
  buckets.stashed_join.push(...stashedLeft);
  if (stashedEagerLoad) buckets.stashed_join.push(stashedEagerLoad);

  return [buckets, Nodes.InnerJoin];
}

/**
 * Resolved inputs for `emitJoinPlan` — the bucket-routed join nodes plus the
 * stashed JoinDependencies to fold into the primary named/left JD. `buildJoins`
 * computes a plan and hands it to the shared emitter. The eager JoinDependency
 * rides in `joins_values` (Rails `apply_join_dependency`) and is stashed from
 * there; `aliases` is threaded in only by the `from(relation)` subquery path,
 * from `build_from`.
 *
 * @internal
 */
export interface JoinEmissionPlan {
  /** LeadingJoin nodes (and, when no stash exists, all raw join nodes), prepended. */
  leadingJoins: Nodes.Join[];
  /** Non-leading raw join nodes, appended last. */
  joinNodes: Nodes.Join[];
  /**
   * JoinDependencies folded into the primary named/left JD's `joinConstraints`
   * (the folded left-outer JD — and, on the subquery path, the eager stash).
   * When no named/left-outer association join exists, the first is the primary.
   */
  stashedJoins: JoinDependency[];
  /** `buckets[:named_join]`, already partitioned by the caller. */
  namedJoins: AssociationSpec[];
  /**
   * The join type `build_join_buckets` returned alongside the buckets
   * (query_methods.rb:1841/1878).
   */
  joinType: typeof Nodes.InnerJoin | typeof Nodes.OuterJoin;
  /** Tracker threaded in from `build_from`; absent on the live path. */
  aliases?: AliasTracker;
  /**
   * The shared tracker, built by the caller via the converged
   * `Relation#aliasTracker(leading_joins + join_nodes, aliases)`
   * (query_methods.rb:1894). A memoized thunk, not an instance:
   * Rails only builds `alias_tracker` inside the
   * `unless named_joins.empty? && stashed_joins.empty?` guard
   * (query_methods.rb:1893), so a relation with no join dependencies to emit
   * must never touch it — `Relation#aliasTracker` reads
   * `model.connectionPool()`, which raises `ConnectionNotDefined` on a
   * connectionless model.
   */
  tracker: () => AliasTracker;
}

/**
 * Single shared port of Rails `build_joins` (query_methods.rb:1881) emission:
 * given a resolved {@link JoinEmissionPlan}, push every join node onto the
 * Arel `SelectManager`. `buildJoins` delegates here so the left_outer/joins
 * dedup fold (PR #3501 / #3890) lives in exactly one place and cannot re-drift.
 *
 * @internal
 */
export function emitJoinPlan(this: QueryMethodsHost, manager: any, plan: JoinEmissionPlan): void {
  if (plan.leadingJoins.length > 0) manager.joinSources().push(...plan.leadingJoins);

  // One AliasTracker shared across every JoinDependency, mirroring Rails' single
  // `build_joins` `alias_tracker(leading_joins + join_nodes, aliases)`
  // (query_methods.rb:1891). Built by the caller (`buildJoins`) via the
  // converged `Relation#aliasTracker` and threaded in on the plan. Seeding it
  // with the leading-join + join-node tables means a JoinDependency joining a
  // table already claimed by a leading/raw join node is re-aliased to its
  // `alias_candidate`. Each dependency claims and aliases its tables lazily at
  // emit-time in `makeConstraints`, so threading this one tracker through every
  // `joinConstraints` makes a merged join onto an already-joined table collide
  // and alias. `plan.aliases` is the tracker threaded in from `build_from`
  // (Rails' `aliases` argument), whose counts the caller folded in. Invoked
  // lazily (see JoinEmissionPlan#tracker) only where a JoinDependency emits;
  // `trackerWasBuilt` records that a forcing site actually ran, gating the
  // aliases writeback below.
  let trackerWasBuilt = false;
  const sharedTracker = (): AliasTracker => {
    trackerWasBuilt = true;
    return plan.tracker();
  };
  const references = (this as any).referencesValues;

  // Rails build_joins (query_methods.rb:1881-1897) emits ALL named association
  // joins — joins_values (InnerJoin) plus the folded left_outer JoinDependency —
  // through a SINGLE `construct_join_dependency(named_joins, join_type)` whose
  // `join_constraints(stashed_joins, …)` folds the stash in one call, so an
  // association joined both ways (`joins(:posts).left_outer_joins(:posts)`)
  // dedups via `walk` to one INNER JOIN. `join_type` is InnerJoin normally,
  // OuterJoin in the pure-left-outer short-circuit (no joins_values). The guard
  // mirrors `unless named_joins.empty? && stashed_joins.empty?`; when named_joins
  // is empty but the stash is not, Rails still builds an empty
  // `construct_join_dependency([], InnerJoin)` and folds the stash into it.
  const namedJoins = plan.namedJoins;
  const joinType = plan.joinType;
  if (namedJoins.length > 0 || plan.stashedJoins.length > 0) {
    const jd = constructJoinDependency.call(this, namedJoins, joinType);
    manager
      .joinSources()
      .push(...jd.joinConstraints(plan.stashedJoins, sharedTracker(), references));
  }

  // `build_joins` concats `buckets[:join_node]` once (query_methods.rb:1899);
  // both callers filled it in Rails' order — raw joins_values Join nodes from
  // the `while joins.first.is_a?(Arel::Nodes::Join)` loop
  // (query_methods.rb:1856-1863) before the CTE nodes the select_named_joins
  // block appends (query_methods.rb:1865-1873).
  if (plan.joinNodes.length > 0) manager.joinSources().push(...plan.joinNodes);

  // When a tracker was threaded in (Rails passes the alias HASH itself to
  // `join_scope.arel(alias_tracker.aliases)`, so claims made while building this
  // manager mutate the caller's tracker), propagate the alias counts this
  // emission claimed back into it. Without this, a scope's `joins(:post)` join
  // source and a sibling explicit `:post` join in the SAME outer JoinDependency
  // would both re-alias `posts` to the same candidate and collide — the outer
  // tracker must learn what the nested scope build already claimed.
  // Only when a JoinDependency emission actually forced the tracker: Rails'
  // `build_joins` skips `alias_tracker` entirely when the
  // `named_joins.empty? && stashed_joins.empty?` guard fails, even with
  // `aliases` supplied (query_methods.rb:1893) — a joinless nested
  // `join_scope.arel(aliases)` build claims nothing in the caller's hash, and
  // forcing the thunk here would re-open the `connectionPool()` raise on a
  // connectionless model that the lazy tracker exists to avoid.
  if (plan.aliases && trackerWasBuilt) {
    for (const [name, count] of sharedTracker().aliases) {
      if (count > (plan.aliases.aliases.get(name) ?? 0)) plan.aliases.aliases.set(name, count);
    }
  }
}

/**
 * @internal
 *
 * @missingRailsCall empty? — PERMANENT: Verified per-site (RFC 0106): `joins_values.empty?`
 *   / `left_outer_joins_values.empty?` / `leading_joins.empty?`
 *   (query_methods.rb:1882,1891,1893) — `empty?` on a Ruby Array, whose faithful
 *   JS spelling is `xs.length === 0`. That emits no callee, so no TS call can
 *   ever credit the Ruby one. The gate flags it only because `empty?` maps onto
 *   the unrelated `ActiveRecord::Result.empty`, which takes arguments since it
 *   gained Rails' `async:` kwarg (result.rb:94-100) — nothing in the TS body was
 *   dropped.
 */
export function buildJoins(this: QueryMethodsHost, arel: any, aliases?: AliasTracker): void {
  // query_methods.rb:1882 — `return if joins_values.empty? && left_outer_joins_values.empty?`.
  if (this.joinsValues.length === 0 && this.leftOuterJoinsValues.length === 0) return;

  const [buckets, joinType] = buildJoinBuckets.call(this);
  const leadingJoins = buckets.leading_join as Nodes.Join[];
  const joinNodes = buckets.join_node as Nodes.Join[];
  // Rails: `alias_tracker = alias_tracker(leading_joins + join_nodes, aliases)`
  // (query_methods.rb:1894) — the converged `Relation#aliasTracker`, built
  // lazily behind the same `unless named_joins.empty? && stashed_joins.empty?`
  // guard Rails builds it under (see JoinEmissionPlan#tracker).
  let memoTracker: AliasTracker | undefined;
  const tracker = (): AliasTracker => {
    memoTracker ??= this.aliasTracker([...leadingJoins, ...joinNodes], aliases?.aliases);
    return memoTracker;
  };
  emitJoinPlan.call(this, arel, {
    leadingJoins,
    joinNodes,
    stashedJoins: buckets.stashed_join as JoinDependency[],
    namedJoins: buckets.named_join as AssociationSpec[],
    joinType,
    aliases,
    tracker,
  });
}

/**
 * @internal
 *
 * @missingRailsCall empty? — PERMANENT: Verified per-site (RFC 0106): `with_values.empty?`
 *   (query_methods.rb:1914) — `empty?` on a Ruby Array, whose faithful JS
 *   spelling is `xs.length === 0`. That emits no callee, so no TS call can ever
 *   credit the Ruby one. The gate flags it only because `empty?` maps onto the
 *   unrelated `ActiveRecord::Result.empty`, which takes arguments since it
 *   gained Rails' `async:` kwarg (result.rb:94-100) — nothing in the TS body was
 *   dropped.
 */
export function buildWith(this: QueryMethodsHost, arel: any): void {
  if (this.withValues.length === 0) return;

  const withStatements = this.withValues.flatMap((withValue) =>
    buildWithValueFromHash.call(this, withValue),
  );

  // Rails is `arel.with(:recursive, with_statements)`; trails' SelectManager
  // splits the Symbol arm into its own `withRecursive`, and both take the
  // statements varargs where Ruby's flattens the array it is handed.
  if (this._withIsRecursive) {
    arel.withRecursive?.(...withStatements);
  } else {
    arel.with?.(...withStatements);
  }
}

/**
 * @internal
 *
 * @missingRailsCall first — PERMANENT: Verified per-site (RFC 0106): `.join_sources.first`
 *   (query_methods.rb:1959) — Ruby `Array#first` on the join-sources Array,
 *   spelled `.joinSources()[0]` in TS.
 * @missingRailsCall order:table,constructor — CONVERGEABLE: Verified per-site (RFC 0106):
 *   ORDER only. Rails constructs `Arel::Table.new(name)` before touching `table`
 *   (query_methods.rb:1955-1957); the port hoists `this.table` into a local
 *   first so it can raise its no-arel-table guard before allocating
 *   (query-methods.ts:3658-3660). Same calls, same results. Tracked by story
 *   query-methods-order-only-call-inversions (RFC 0106).
 */
export function buildWithJoinNode(
  this: QueryMethodsHost,
  name: string,
  kind: typeof Nodes.InnerJoin | typeof Nodes.OuterJoin = Nodes.InnerJoin,
): unknown {
  const mc = this.model;
  const table: any = this.table;
  if (!table) throw new ActiveRecordError("Cannot build CTE join node: model has no arelTable");
  const withTable = new ArelTable(name);
  // Rails: with_table[model.model_name.to_s.foreign_key].eq(table[model.primary_key])
  const modelName = String(mc?.modelName ?? mc?.name ?? "Model");
  const fk = foreignKey(modelName);
  if (Array.isArray(mc?.primaryKey)) {
    throw new ActiveRecordError("Cannot build CTE join node with composite primary keys");
  }
  const pk = mc?.primaryKey ?? "id";
  return table
    .join(withTable, kind)
    .on(withTable.get(fk).eq(table.get(pk)))
    .joinSources()[0];
}
