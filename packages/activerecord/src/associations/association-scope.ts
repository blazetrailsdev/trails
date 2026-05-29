import { Table as ArelTable, Nodes } from "@blazetrails/arel";
import type { Base } from "../base.js";
import type { AssociationReflection, AbstractReflection } from "../reflection.js";
import { AliasTracker } from "./alias-tracker.js";
import { polymorphicName } from "../inheritance.js";
import { CompositePrimaryKeyMismatchError } from "./errors.js";
import type { Quoting } from "../connection-adapters/abstract/quoting-interface.js";

/**
 * Lambda applied to each FK/type bind value before it reaches the
 * generated WHERE. Rails uses this to let STI base_class / polymorphic
 * name rewriting flow through the same scope-building path as ordinary
 * attribute reads.
 */
export type ValueTransformation<T = unknown> = (v: T) => unknown;

/**
 * Invoke a scope lambda using this port's calling convention:
 * 0-arg lambdas → `fn.call(rel)` (`this=rel`, no positional args);
 * 1+-arg lambdas → `fn.call(rel, rel, owner)` (`this=rel`, positional
 * `(rel, owner)`). Returns the raw lambda result; callers apply `|| rel`
 * if they want Ruby-style `instance_exec(owner, &scope) || relation`
 * truthy-fallback semantics.
 *
 * NOT a 1:1 port of Rails' `relation.instance_exec(owner, &scope)`
 * (reflection.rb:449), which passes `owner` as the sole positional
 * arg. Every call site in this codebase writes scopes as
 * `(rel) => rel.where(...)`, so a 1-arg lambda here receives the
 * relation; arity-2 declarations can opt into `(rel, owner)`. The
 * `this`-binding only applies to `function`-keyword scopes — arrow
 * functions have lexical `this` and ignore `.call`.
 *
 * @internal
 */
export type ScopeLambda<R> = (this: R, rel: R, owner: Base) => R | false | null | undefined;

/** @internal */
export function invokeScopeLambda<R>(
  fn: ScopeLambda<R>,
  rel: R,
  owner: Base,
): R | false | null | undefined {
  return fn.length === 0
    ? (fn as (this: R) => ReturnType<ScopeLambda<R>>).call(rel)
    : fn.call(rel, rel, owner);
}

/**
 * Minimum shape `AssociationScope.scope` needs from its argument. Rails
 * passes a concrete `Association` instance (see
 * `activerecord/lib/active_record/associations/association.rb`); we
 * duck-type so the internal loader paths in `associations.ts` — which
 * don't always have an Association wrapper — can use the same code.
 */
export interface AssociationScopeable {
  readonly owner: Base;
  readonly reflection: AssociationReflection;
  readonly klass: typeof Base;
}

/**
 * Proxy wrapping a reflection with the aliased table that AssociationScope
 * computes when walking `reflection.chain`. For chain length 1 the
 * aliased table is just `reflection.klass.arelTable`; non-trivial chains
 * (added in a later PR) ask `AliasTracker#aliasedTableFor` for a unique
 * alias via `reflection.aliasCandidate(name)`.
 *
 * Mirrors: ActiveRecord::Associations::AssociationScope::ReflectionProxy
 * (association_scope.rb:101-110 in Rails 8.0.2 — SimpleDelegator wrapping
 * a reflection plus `attr_reader :aliased_table` and
 * `def all_includes; nil; end`.)
 */
export class ReflectionProxy {
  // AbstractReflection rather than AssociationReflection because chain
  // entries can be ThroughReflection / PolymorphicReflection wrappers;
  // ReflectionProxy only reads structural fields (joinPrimaryKey/Fk,
  // type, klass, name, scope, scopeFor) that all chain entries provide.
  readonly reflection: AbstractReflection;
  readonly aliasedTable: unknown;

  constructor(reflection: AbstractReflection, aliasedTable: unknown) {
    this.reflection = reflection;
    this.aliasedTable = aliasedTable;
  }

  /**
   * Block-form opt-out Rails uses to skip eager-load propagation through
   * the chain. We mirror the sentinel (return `null`) — callers in later
   * PRs check for non-null to decide whether to merge `includes_values`.
   */
  allIncludes<T>(_cb?: () => T): T | null {
    return null;
  }

  // SimpleDelegator-style forwarding of the attributes AssociationScope
  // reads. Kept explicit instead of a runtime Proxy so TypeScript sees
  // the shape. The `_r` getter centralizes the cast — these fields are
  // present on every chain entry shape (AssociationReflection,
  // ThroughReflection, PolymorphicReflection) but not declared on the
  // AbstractReflection base.
  private get _r(): {
    joinPrimaryKey: string | string[];
    joinForeignKey: string | string[];
    type?: string | null;
    klass: typeof Base;
    name: string;
    scope?: ((rel: unknown) => unknown) | null;
    joinPrimaryKeyFor?: (klass?: typeof Base) => string | string[];
    scopeFor?: (rel: unknown, owner?: unknown) => unknown;
  } {
    return this.reflection as unknown as ReturnType<() => ReflectionProxy["_r"]>;
  }

  get joinPrimaryKey(): string | string[] {
    return this._r.joinPrimaryKey;
  }

  /**
   * Forwarding `joinPrimaryKeyFor(klass)` so AssociationScope's
   * runtime-klass path (polymorphic belongsTo) finds the correct
   * primary key column on the resolved target. Falls back to the
   * static `joinPrimaryKey` if the reflection doesn't expose it.
   */
  joinPrimaryKeyFor(klass?: typeof Base): string | string[] {
    return typeof this._r.joinPrimaryKeyFor === "function"
      ? this._r.joinPrimaryKeyFor(klass)
      : this._r.joinPrimaryKey;
  }

  get joinForeignKey(): string | string[] {
    return this._r.joinForeignKey;
  }

  get type(): string | null {
    return this._r.type ?? null;
  }

  get klass(): typeof Base {
    return this._r.klass;
  }

  get name(): string {
    return this._r.name;
  }

  get scope(): ((rel: unknown) => unknown) | undefined {
    return (this.reflection as unknown as { scope?: (rel: unknown) => unknown }).scope;
  }

  /**
   * Forwarding `scopeFor` to the underlying reflection. Rails'
   * `ReflectionProxy < SimpleDelegator` gets this via delegation;
   * we forward explicitly so AssociationScope can call
   * `proxy.scopeFor(rel, owner)` and get Rails-faithful arity +
   * `instance_exec`-style binding.
   */
  scopeFor(relation: unknown, owner?: unknown): unknown {
    return (
      (
        this.reflection as unknown as {
          scopeFor?: (rel: unknown, owner?: unknown) => unknown;
        }
      ).scopeFor?.(relation, owner) ?? relation
    );
  }

  constraints(): Array<(...args: unknown[]) => unknown> {
    return this.reflection.constraints() as Array<(...args: unknown[]) => unknown>;
  }
}

/**
 * Builds the scope (query) for an association based on its reflection.
 *
 * Rails implementation (activerecord/lib/active_record/associations/association_scope.rb):
 *   - `self.scope(association)` → `INSTANCE.scope(association)`
 *   - `self.create(&block)` → `new(block ||= identity)`
 *   - `INSTANCE = create` (identity transformation)
 *
 * PR 1 scope: chain length 1 (non-through). PRs 2+ add polymorphic
 * `as:`, multi-step through chains, and `DisableJoinsAssociationScope`.
 *
 * Mirrors: ActiveRecord::Associations::AssociationScope
 */
export class AssociationScope {
  private readonly _valueTransformation: ValueTransformation;

  constructor(valueTransformation: ValueTransformation) {
    this._valueTransformation = valueTransformation;
  }

  static create<T extends typeof AssociationScope>(
    this: T,
    valueTransformation?: ValueTransformation,
  ): InstanceType<T> {
    return new this(valueTransformation ?? ((v: unknown) => v)) as InstanceType<T>;
  }

  /** Identity-lambda shared instance. Rails: `INSTANCE = create`. */
  static readonly INSTANCE: AssociationScope = AssociationScope.create();

  /**
   * Entry point. Build the Relation that loads (or filters) the given
   * association's records for its owner. Polymorphic via `this.INSTANCE`
   * so a subclass with its own `static INSTANCE` (e.g.
   * `DisableJoinsAssociationScope`) routes through that subclass'
   * instance — matching Rails' `AssociationScope.scope(association)` /
   * `INSTANCE` lookup chain.
   *
   * Mirrors: ActiveRecord::Associations::AssociationScope.scope
   */
  static scope(this: typeof AssociationScope, association: AssociationScopeable): unknown {
    return this.INSTANCE.scope(association);
  }

  /**
   * Collect the bind values consumed by the chain — in chain order.
   * For chain length 1 this is `[owner[joinForeignKey], owner.class.name?]`.
   * For multi-step chains, intermediate reflections contribute the
   * polymorphic type of the NEXT reflection's klass so JOINs filter by
   * STI base class correctly.
   *
   * Mirrors: ActiveRecord::Associations::AssociationScope.get_bind_values
   * (association_scope.rb:34-49).
   */
  static getBindValues(
    owner: Base,
    chain: ReadonlyArray<AbstractReflection | ReflectionProxy>,
  ): unknown[] {
    const binds: unknown[] = [];
    const last = chain[chain.length - 1];
    if (!last) return binds;
    const joinFk = (last as { joinForeignKey?: string | string[] }).joinForeignKey;
    const fks = Array.isArray(joinFk) ? joinFk : joinFk ? [joinFk] : [];
    for (const fk of fks) binds.push(owner._readAttribute(fk));
    if ((last as { type?: string | null }).type) {
      binds.push(polymorphicName(owner.constructor as typeof Base));
    }
    for (let i = 0; i < chain.length - 1; i++) {
      const refl = chain[i];
      const next = chain[i + 1];
      if ((refl as { type?: string | null }).type) {
        const nextKlass = (next as { klass?: typeof Base }).klass;
        binds.push(nextKlass ? polymorphicName(nextKlass) : null);
      }
    }
    return binds;
  }

  /**
   * Build the association's relation for `association.owner`. The
   * returned value is an unexecuted `Relation` (so callers can chain
   * `.where`/`.order`/`.toArray`).
   *
   * Mirrors: ActiveRecord::Associations::AssociationScope#scope
   * (association_scope.rb:21-32).
   */
  scope(association: AssociationScopeable): unknown {
    const { owner, reflection, klass } = association;
    const quoter = klass.connection as unknown as Quoting;
    // Rails: `klass.unscoped` (association_scope.rb:23). Rails' unscoped
    // bypasses default_scope but STILL applies the STI `type_condition`
    // because `relation()` adds it for `finder_needs_type_condition?`
    // classes (`core.rb:431-435`). `Base.unscoped` now wires STI through
    // `_buildUnscopedRelation`, so no compensation is needed here.
    let scope: unknown = klass.unscoped();
    // Per-scope-build AliasTracker. Rails seeds it from
    // `scope.alias_tracker` (associations/association_scope.rb:26);
    // we don't expose one on Relation yet, so create a fresh tracker
    // here seeded with the owning klass's table name (matches Rails'
    // default seeding with `klass.arel_table`). The tracker is
    // shared across the chain walk within this call so repeated
    // joins to the same table get unique aliases.
    const tracker = AliasTracker.create(null, klass.arelTable.name, [], undefined, quoter);
    const chain = this.getChain(reflection, tracker);
    // Rails: `scope.extending! reflection.extensions` (association_scope.rb:28).
    // Mix any `extend:`-declared modules onto the relation so extension
    // methods are available on the loaded association's relation.
    const extensions =
      typeof (reflection as { extensions?: () => unknown[] }).extensions === "function"
        ? (reflection as { extensions: () => unknown[] }).extensions()
        : [];
    if (extensions.length > 0) {
      scope = (scope as { extendingBang: (...m: unknown[]) => unknown }).extendingBang(
        ...extensions,
      );
    }
    scope = this.addConstraints(scope, owner, chain, klass);
    if (!reflection.isCollection()) {
      scope = (scope as { limit: (n: number) => unknown }).limit(1);
    }
    return scope;
  }

  /**
   * The transform lambda passed to the constructor. Rails exposes this as
   * a private `attr_reader :value_transformation` (association_scope.rb:52).
   *
   * @internal
   */
  private get valueTransformation(): ValueTransformation {
    return this._valueTransformation;
  }

  private transformValue<T>(value: T): unknown {
    return this.valueTransformation(value);
  }

  /**
   * Rails checks `scope.table == table` and scopes the where to the
   * joined table's alias in the multi-step case. For chain length 1
   * `scope.table` is the klass table, so the where goes directly on the
   * relation. For multi-step (through), `table` is a different
   * (joined-in) table — qualify the WHERE as `<table>.<key> = ?`.
   *
   * Mirrors: ActiveRecord::Associations::AssociationScope#apply_scope
   * (association_scope.rb:161-167).
   */
  private applyScope(scope: unknown, table: string | null, key: string, value: unknown): unknown {
    const w = scope as {
      where: (c: Record<string, unknown> | unknown) => unknown;
      _modelClass?: { tableName?: string };
    };
    const scopeTable = w._modelClass?.tableName ?? null;
    if (table && scopeTable && table !== scopeTable) {
      // Table-qualified WHERE for through chains where the FK lives on
      // an intermediate joined-in table. Use Arel so identifier quoting
      // and value escaping go through the same path as the rest of the
      // query — no manual interpolation.
      const node = new ArelTable(table).get(key).eq(value);
      return w.where(node);
    }
    return w.where({ [key]: value });
  }

  /**
   * For the LAST reflection in the chain (which for chain-1 is the only
   * one), apply owner-FK WHERE clauses plus the polymorphic `_type`
   * filter if the reflection is polymorphic.
   *
   * Mirrors: ActiveRecord::Associations::AssociationScope#last_chain_scope
   * (association_scope.rb:58-75).
   */
  private lastChainScope(
    scope: unknown,
    reflection: AbstractReflection | ReflectionProxy,
    owner: Base,
    klass?: typeof Base,
  ): unknown {
    const r = reflection as {
      joinPrimaryKey: string | string[];
      joinForeignKey: string | string[];
      joinPrimaryKeyFor?: (klass?: typeof Base) => string | string[];
      type?: string | null;
    };
    // For multi-step chains the reflection is wrapped in ReflectionProxy
    // with an aliasedTable set. For chain length 1 prefer the runtime
    // klass's tableName (passed in) over reflection.klass — the latter
    // throws for polymorphic belongsTo since the target class isn't
    // known at definition time.
    const aliased = (reflection as ReflectionProxy).aliasedTable as
      | string
      | { name?: string }
      | null
      | undefined;
    let table: string | null;
    if (typeof aliased === "string") {
      table = aliased;
    } else if (aliased && typeof aliased === "object" && typeof aliased.name === "string") {
      table = aliased.name;
    } else if (klass && typeof klass.tableName === "string") {
      table = klass.tableName;
    } else {
      try {
        table = (reflection as { klass?: { tableName?: string } }).klass?.tableName ?? null;
      } catch {
        table = null;
      }
    }
    // For polymorphic belongsTo, `joinPrimaryKey` is hard-coded to "id"
    // because the target klass isn't known at definition time. The
    // runtime klass comes from `AssociationScopeable.klass`; route
    // through `joinPrimaryKeyFor(klass)` so the correct PK column (incl.
    // composite / non-"id") is used. Mirrors Rails'
    // `BelongsToReflection#join_primary_key_for(klass)`
    // (reflection.rb:968 in our codebase).
    const joinPk =
      typeof r.joinPrimaryKeyFor === "function" ? r.joinPrimaryKeyFor(klass) : r.joinPrimaryKey;
    const joinPks = Array.isArray(joinPk) ? joinPk : [joinPk];
    const joinFks = Array.isArray(r.joinForeignKey) ? r.joinForeignKey : [r.joinForeignKey];
    // Same guard `AbstractReflection#joinScope` uses — mismatched
    // composite join-key lengths would silently read
    // `owner.readAttribute(undefined)` and generate a broken WHERE.
    // Rails raises CompositePrimaryKeyMismatchError from
    // checkValidityBang for the equivalent case
    // (associations/errors.rb:187, reflection.rb:623); use the same
    // class here so callers can rescue uniformly.
    if (joinPks.length !== joinFks.length) {
      const name = (reflection as { name?: string }).name ?? "<unknown>";
      const ownerName = (owner.constructor as typeof Base).name;
      throw new CompositePrimaryKeyMismatchError(ownerName, name);
    }
    for (let i = 0; i < joinPks.length; i++) {
      const rawValue = owner._readAttribute(joinFks[i]);
      const value = this.transformValue(rawValue);
      scope = this.applyScope(scope, table, joinPks[i], value);
    }
    if (r.type) {
      // Rails: `owner.class.polymorphic_name` (returns base_class.name
      // for STI subclasses) routed through `transform_value`.
      const polyName = this.transformValue(polymorphicName(owner.constructor as typeof Base));
      scope = this.applyScope(scope, table, r.type, polyName);
    }
    return scope;
  }

  /**
   * Build the chain of reflections to walk. Rails wraps all-but-head in
   * `ReflectionProxy` with an aliased_table from `AliasTracker` so
   * repeated joins to the same table get unique aliases — e.g. a
   * self-referential `has_many :through` that visits the same table
   * twice in one chain. `tracker.aliasedTableFor(arelTable, candidate)`
   * returns the base Arel table on the first visit and, on subsequent
   * visits, an Arel table aliased to the supplied candidate — with a
   * numeric suffix (`candidate_2`, `_3`, ...) only when the candidate
   * itself has already been used.
   *
   * Mirrors: ActiveRecord::Associations::AssociationScope#get_chain
   * (association_scope.rb:112-122).
   */
  protected getChain(
    reflection: AssociationReflection,
    tracker?: AliasTracker,
  ): Array<AbstractReflection | ReflectionProxy> {
    const chain: Array<AbstractReflection | ReflectionProxy> = [reflection];
    const tail = reflection.chain.slice(1);
    const name = reflection.name;
    for (const refl of tail) {
      const klass = (refl as unknown as { klass?: typeof Base }).klass;
      let aliased: unknown;
      if (tracker && klass) {
        // Rails: `tracker.aliased_table_for(refl.klass.arel_table) {
        // refl.alias_candidate(name) }`. Pass a thunk so
        // `aliasCandidate` is only invoked on repeat visits — first
        // visits return the base arel table without ever building
        // the candidate string.
        aliased = tracker.aliasedTableFor(klass.arelTable, () => {
          const fn = (refl as unknown as { aliasCandidate?: (n: string) => string }).aliasCandidate;
          return typeof fn === "function" ? fn.call(refl, name) : klass.tableName;
        });
      } else {
        // Fallback for the legacy single-call path where no tracker
        // is provided — bare table name, same behavior as before.
        aliased = klass?.tableName ?? "";
      }
      chain.push(new ReflectionProxy(refl, aliased));
    }
    return chain;
  }

  /**
   * Walk a chain pair and emit an INNER JOIN constraint that joins the
   * `next_reflection`'s table back onto the relation. The join condition
   * is built from `reflection.joinPrimaryKey` (target-side column) and
   * `joinForeignKey` (foreign-side column).
   *
   * Mirrors: ActiveRecord::Associations::AssociationScope#next_chain_scope
   * (association_scope.rb:81-99).
   */
  private nextChainScope(
    scope: unknown,
    reflection: AbstractReflection | ReflectionProxy,
    nextReflection: AbstractReflection | ReflectionProxy,
    klass?: typeof Base,
  ): unknown {
    const r = reflection as {
      joinPrimaryKey: string | string[];
      joinForeignKey: string | string[];
      joinPrimaryKeyFor?: (klass?: typeof Base) => string | string[];
      klass?: { tableName?: string };
      type?: string | null;
    };
    const nr = nextReflection as {
      joinPrimaryKey: string | string[];
      joinForeignKey: string | string[];
      klass?: { tableName?: string };
      aliasedTable?: string | { name?: string };
    };
    // For polymorphic belongsTo sources, reflection.joinPrimaryKey is
    // hard-coded to "id" — but the resolved sourceType class may use a
    // different PK. Route through joinPrimaryKeyFor(klass) when the
    // reflection exposes it (ThroughReflection / BelongsToReflection
    // both do) so the JOIN uses the right target PK column.
    const rawJoinPk =
      typeof r.joinPrimaryKeyFor === "function"
        ? r.joinPrimaryKeyFor(klass ?? (r.klass as typeof Base | undefined))
        : r.joinPrimaryKey;
    const joinPks = Array.isArray(rawJoinPk) ? rawJoinPk : [rawJoinPk];
    const joinFks = Array.isArray(r.joinForeignKey) ? r.joinForeignKey : [r.joinForeignKey];
    if (joinPks.length !== joinFks.length) {
      // Unwrap ReflectionProxy so activeRecord/name come from the
      // underlying reflection rather than reading "<unknown>" off the
      // proxy (which doesn't forward activeRecord).
      const base =
        (reflection as { reflection?: { name?: string; activeRecord?: { name?: string } } })
          .reflection ?? (reflection as { name?: string; activeRecord?: { name?: string } });
      const name = base.name ?? "<unknown>";
      const ownerName = base.activeRecord?.name ?? "<unknown>";
      throw new CompositePrimaryKeyMismatchError(ownerName, name);
    }
    // For polymorphic belongsTo-through with sourceType, r.klass may
    // throw (polymorphic) or resolve to the wrong class; prefer the
    // explicit runtime klass passed in when available.
    let tableName: string;
    if (klass && typeof klass.tableName === "string") {
      tableName = klass.tableName;
    } else {
      try {
        tableName = r.klass?.tableName ?? "";
      } catch {
        tableName = "";
      }
    }
    // nextReflection may be a ReflectionProxy (with aliasedTable) or a
    // raw reflection; resolve its table name the same way.
    const aliased = nr.aliasedTable;
    const foreignTableName =
      typeof aliased === "string"
        ? aliased
        : aliased && typeof aliased === "object" && typeof aliased.name === "string"
          ? aliased.name
          : (nr.klass?.tableName ?? "");
    // Build the ON condition as Arel constraint nodes —
    // `table[join_primary_key].eq(foreign_table[foreign_key])` folded with
    // `.and` — exactly as Rails' next_chain_scope (association_scope.rb:88-91).
    // Identifier quoting and value escaping flow through the Arel visitor,
    // so no manual interpolation or quoter is needed.
    const tableNode = this._arelTableFor(reflection, tableName);
    const foreignTableNode = this._arelTableFor(nextReflection, foreignTableName);
    let constraint: Nodes.Node = tableNode.get(joinPks[0]).eq(foreignTableNode.get(joinFks[0]));
    for (let i = 1; i < joinPks.length; i++) {
      constraint = constraint.and(tableNode.get(joinPks[i]).eq(foreignTableNode.get(joinFks[i])));
    }
    if (r.type) {
      // Polymorphic through: filter by the next reflection's klass
      // polymorphic name via a WHERE on `reflection.type` — Rails routes
      // this through apply_scope (a WHERE clause), NOT the JOIN ON
      // (association_scope.rb:93-96). Routes through both `polymorphicName`
      // (base_class.name for STI) and the value-transformation lambda.
      const nextKlass = (nextReflection as { klass?: typeof Base }).klass;
      const nextName = nextKlass ? polymorphicName(nextKlass) : "";
      // Qualify with the resolved node's name — the alias for an aliased
      // chain, the bare table otherwise — matching Rails' `apply_scope(scope,
      // table, ...)` where `table` is `reflection.aliased_table` (so
      // `table.name` is the alias). Keeps the `_type` WHERE on the same
      // identifier the JOIN uses.
      scope = this.applyScope(scope, tableNode.name, r.type, this.transformValue(nextName));
    }
    // Wrap the join target + constraint in Arel's LeadingJoin/On nodes via
    // `join()` and push it through Relation#joins, which stores Arel join
    // nodes in joins_values (mirrors Rails' `scope.joins!(join(...))`).
    return (scope as { joins: (node: Nodes.Join) => unknown }).joins(
      this.join(foreignTableNode, constraint) as Nodes.Join,
    );
  }

  /**
   * Resolve the Arel table for a chain reflection. Prefers the reflection's
   * `aliasedTable` node as produced by the AliasTracker — a base `Table` on
   * first visit, or a `TableAlias` (`real_table AS alias`) on a repeated-table
   * chain (self-referential `has_many :through`). Returning the node verbatim
   * keeps both the join target (`INNER JOIN "real" "alias"`) and the ON-clause
   * column qualifiers (`"alias"."col"`) aligned with the alias — flattening a
   * `TableAlias` to `new ArelTable(alias)` would emit `INNER JOIN "alias"` and
   * generate invalid SQL. Falls back to a bare table built from `name`.
   * Mirrors Rails reading `reflection.aliased_table` directly as an
   * `Arel::Table` (association_scope.rb:85-86).
   *
   * @internal
   */
  private _arelTableFor(
    reflection: AbstractReflection | ReflectionProxy,
    name: string,
  ): ArelTable | Nodes.TableAlias {
    const aliased = (reflection as ReflectionProxy).aliasedTable;
    if (aliased instanceof ArelTable || aliased instanceof Nodes.TableAlias) return aliased;
    if (typeof aliased === "string" && aliased) return new ArelTable(aliased);
    if (
      aliased &&
      typeof aliased === "object" &&
      typeof (aliased as { name?: unknown }).name === "string"
    ) {
      return new ArelTable((aliased as { name: string }).name);
    }
    return new ArelTable(name);
  }

  /**
   * Fold `last_chain_scope` over the chain and merge any user-supplied
   * `scope` lambdas (reflection.scope / reflection.constraints) into the
   * relation. PR 1 applies the scope lambda on the tail only.
   *
   * Mirrors: ActiveRecord::Associations::AssociationScope#add_constraints
   * (association_scope.rb:124-159).
   */
  private addConstraints(
    scope: unknown,
    owner: Base,
    chain: Array<AbstractReflection | ReflectionProxy>,
    klass?: typeof Base,
  ): unknown {
    const last = chain[chain.length - 1];
    scope = this.lastChainScope(scope, last, owner, klass);
    // For multi-step chains, walk pairs and add INNER JOINs — Rails'
    // `chain.each_cons(2) { |r, nr| next_chain_scope(scope, r, nr) }`
    // (association_scope.rb:128-130).
    for (let i = 0; i < chain.length - 1; i++) {
      scope = this.nextChainScope(scope, chain[i], chain[i + 1], klass);
    }
    // Rails' chain.reverse_each over reflection.constraints (Rails:
    // association_scope.rb:131-156) merges scope-chain items into the
    // relation. For each non-head reflection in the chain (in REVERSE
    // order to match Rails' chain.reverse_each), we apply its scope
    // lambda to a fresh klass.(unscoped + STI type filter), then push
    // only the WHERE and ORDER predicates onto the main scope —
    // matching Rails' `where_clause +=` / `order_values |=` granular
    // merging (NOT a full Relation#merge, which would let the chain
    // entry's limit/select/etc override the main scope). The head
    // reflection (chain[0]) is handled by the scope/scopeFor branch
    // below — Rails' chain_head item in add_constraints.
    //
    // Rails' reverse_each loop ALSO has an eager-load branch that merges
    // a scope-chain item's includes/eager_load via
    // `construct_join_dependency(associations, Arel::Nodes::OuterJoin)`
    // (association_scope.rb:138-141). We don't propagate eager loads
    // through the association scope here — the preloader handles that —
    // so this branch isn't ported; the reference keeps the documented
    // Rails dependency (activerecord → arel) visible.
    void Nodes.OuterJoin;
    for (let i = chain.length - 1; i >= 1; i--) {
      scope = this._mergeReflectionScopeChain(scope, chain[i], owner);
    }
    // Apply the head reflection's scope. Rails: reflection.rb:448,
    // scope_for — 0-arity scopes get `this`=relation, >=1-arity get
    // (relation, owner) per `relation.instance_exec(owner, &scope) ||
    // relation`. For ordinary AssociationReflections we call `scopeFor`
    // when present. ThroughReflection does NOT implement `scopeFor`;
    // it only exposes `.scope` (delegated to the underlying source
    // association's scope), so detect through explicitly and invoke
    // `.scope` directly with the same arity / `this` semantics.
    const head = chain[0] as {
      scopeFor?: (rel: unknown, owner: unknown) => unknown;
      scope?: ((rel: unknown, owner?: unknown) => unknown) | null;
      isThroughReflection?: () => boolean;
    };
    const isThrough = typeof head.isThroughReflection === "function" && head.isThroughReflection();
    if (!isThrough && typeof head.scopeFor === "function") {
      scope = head.scopeFor.call(head, scope, owner);
    } else if (typeof head.scope === "function") {
      const result = invokeScopeLambda(head.scope as ScopeLambda<unknown>, scope, owner);
      if (result) scope = result;
    }
    return scope;
  }

  /**
   * Apply a non-head chain entry's scope lambda. Rails' add_constraints
   * does this via `eval_scope` + `scope.where_clause += item.where_clause`
   * + `scope.order_values = item.order_values | scope.order_values` —
   * granular per-attribute merging that pushes ONLY where and order
   * predicates onto the main relation. A through-reflection scope's
   * limit / select / joins / etc must NOT override the main scope.
   *
   * For non-head entries we evaluate the lambda against a fresh
   * `entry.klass.unscoped` (with STI type_condition re-applied for
   * subclasses, matching the head-scope path in `scope()`) so its
   * `where(...)` calls bind to the correct table. We then push the
   * resulting WHERE predicates onto the main scope and union the
   * ORDER clauses.
   *
   * Mirrors: ActiveRecord::Associations::AssociationScope#add_constraints
   * (association_scope.rb:131-156).
   */
  private _mergeReflectionScopeChain(
    scope: unknown,
    reflection: AbstractReflection | ReflectionProxy,
    owner: Base,
  ): unknown {
    const r = reflection as {
      scope?: ((rel: unknown, owner?: unknown) => unknown) | null;
      scopeFor?: (rel: unknown, owner?: unknown) => unknown;
      klass?: typeof Base;
    };
    const entryKlass = r.klass;
    if (!entryKlass) return scope;
    // Iterate `reflection.constraints()` rather than special-casing
    // PolymorphicReflection via instanceof. For ordinary
    // AssociationReflection / ReflectionProxy entries `constraints()`
    // returns `chain.flatMap(scopes)` — for non-through chain entries
    // that's just `[self.scope].compact`. For PolymorphicReflection
    // (sourceType wrapper) `constraints()` ALSO returns the
    // `source_type_scope` lambda
    // (`where(foreign_type: source_type)`). Iterating handles both
    // cases without an instanceof check, avoiding a value-import cycle
    // (reflection → associations → association-scope → reflection).
    const constraints =
      (
        reflection as { constraints?: () => Array<(...args: unknown[]) => unknown> }
      ).constraints?.() ?? [];
    if (constraints.length === 0) return scope;
    let merged = scope;
    for (const c of constraints) {
      if (typeof c !== "function") continue;
      const evaluated = this.evalScope(reflection, c, owner);
      merged = this._pushScopeIntoRelation(merged, evaluated);
    }
    return merged;
  }

  /**
   * Evaluate a chain entry's scope lambda against a fresh relation built
   * from its klass. Rails: `relation = reflection.build_scope(reflection
   * .aliased_table); relation.instance_exec(owner, &scope)`
   * (association_scope.rb:169-172). We build the relation via
   * `_buildEntryScope` (= `klass.unscoped`, which carries the STI
   * type_condition) and invoke with `invokeScopeLambda`'s arity / `this`
   * semantics: 0-arg → `call(relation)`; 1+-arg → `call(relation, relation,
   * owner)`. The common 0-arg form Rails uses for scope_for_association /
   * source_type_scope (`function () { return this.where(...) }`) relies on
   * `this` being the relation. Unlike Rails we omit the `|| relation`
   * truthy-fallback — callers push only the evaluated WHERE/ORDER
   * predicates, and falling back to the bare relation would re-push its
   * STI predicate.
   *
   * @internal
   */
  private evalScope(
    reflection: AbstractReflection | ReflectionProxy,
    scopeFn: (...args: unknown[]) => unknown,
    owner: Base,
  ): unknown {
    const entryKlass = (reflection as { klass?: typeof Base }).klass;
    if (!entryKlass) return undefined;
    const relation = this._buildEntryScope(entryKlass);
    return invokeScopeLambda(scopeFn as ScopeLambda<unknown>, relation, owner);
  }

  /**
   * Build the Arel join node Rails wraps a chain join in:
   * `Arel::Nodes::LeadingJoin.new(table, Arel::Nodes::On.new(constraint))`
   * (association_scope.rb:54-56). Wired into `nextChainScope`, which passes
   * the result to `Relation#joins` so it lands in `joins_values` as a
   * `LeadingJoin` node — matching Rails' `scope.joins!(join(...))`.
   *
   * @internal
   */
  private join(table: unknown, constraint: unknown): unknown {
    return new Nodes.LeadingJoin(table as never, new Nodes.On(constraint as never));
  }

  /**
   * Build a fresh scope for evaluating a chain entry's lambda. Mirrors
   * `entryKlass.unscoped` — Rails' `unscoped` retains the STI type filter
   * via `relation()` (core.rb:431-435), and `Base.unscoped` now wires that
   * through `_buildUnscopedRelation`, so no compensation is needed here.
   */
  protected _buildEntryScope(entryKlass: typeof Base): unknown {
    return (entryKlass as unknown as { unscoped: () => unknown }).unscoped();
  }

  /**
   * Push ONLY the entry's WHERE predicates and ORDER clauses onto
   * the main scope — Rails' `where_clause += ...` / `order_values |=`
   * semantics. A full Relation#merge would let the entry's limit /
   * select / joins / etc override the main scope, which Rails
   * explicitly avoids.
   */
  protected _pushScopeIntoRelation(scope: unknown, evaluated: unknown): unknown {
    if (!evaluated) return scope;
    const evalWhere = (evaluated as { _whereClause?: { predicates?: unknown[] } })._whereClause;
    const evalPredicates = evalWhere?.predicates ?? [];
    const evalOrders = (evaluated as { _orderClauses?: unknown[] })._orderClauses ?? [];
    const evalRawOrders = (evaluated as { _rawOrderClauses?: string[] })._rawOrderClauses ?? [];
    const merged = scope as {
      _whereClause?: { predicates?: unknown[] };
      _orderClauses?: unknown[];
      _rawOrderClauses?: string[];
    };
    // Mutate the existing _whereClause's predicates array in place —
    // appending all entry predicates in one shot — instead of looping
    // with `.where()` which would clone the relation per-predicate.
    // Safe because `scope` here is owned by this addConstraints call
    // (built fresh from klass.unscoped + per-step .where clones; not
    // shared externally).
    if (evalPredicates.length > 0) {
      const existingPredicates = merged._whereClause?.predicates ?? [];
      existingPredicates.push(...evalPredicates);
      if (merged._whereClause) {
        merged._whereClause.predicates = existingPredicates;
      }
    }
    // Rails: `scope.order_values = item.order_values | scope.order_values`
    // (association_scope.rb:153). Chain-entry-first + structural dedup.
    if (evalOrders.length > 0) {
      merged._orderClauses = unionOrderClauses(evalOrders, merged._orderClauses ?? []);
    }
    if (evalRawOrders.length > 0) {
      const existingRaw = merged._rawOrderClauses ?? [];
      merged._rawOrderClauses = Array.from(new Set([...evalRawOrders, ...existingRaw]));
    }
    return merged;
  }
}

/**
 * Structurally dedupe `_orderClauses` entries (plain strings or
 * `[col, "asc"|"desc"]` tuples). `Array#includes` only does reference
 * equality, so two tuples with equal contents created separately
 * wouldn't match. Rails' `|` operator on order_values is structural.
 */
function unionOrderClauses(first: unknown[], second: unknown[]): unknown[] {
  const result: unknown[] = [];
  const seen = new Set<string>();
  for (const o of [...first, ...second]) {
    const key =
      Array.isArray(o) && o.length === 2
        ? `T:${String(o[0])}:${String(o[1])}`
        : typeof o === "string"
          ? `S:${o}`
          : `J:${JSON.stringify(o)}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(o);
    }
  }
  return result;
}
