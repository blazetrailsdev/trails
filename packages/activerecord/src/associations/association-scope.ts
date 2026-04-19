import { Table as ArelTable } from "@blazetrails/arel";
import type { Base } from "../base.js";
import type { AssociationReflection, AbstractReflection } from "../reflection.js";
import {
  isStiSubclass,
  getStiBase,
  getInheritanceColumn,
  descendants,
  polymorphicName,
} from "../inheritance.js";
import { CompositePrimaryKeyMismatchError } from "./errors.js";
import { quoteTableName, quoteColumnName, quote } from "../connection-adapters/abstract/quoting.js";

/**
 * Lambda applied to each FK/type bind value before it reaches the
 * generated WHERE. Rails uses this to let STI base_class / polymorphic
 * name rewriting flow through the same scope-building path as ordinary
 * attribute reads.
 */
export type ValueTransformation<T = unknown> = (v: T) => unknown;

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
    for (const fk of fks) binds.push(owner.readAttribute(fk));
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
    // Rails: `klass.unscoped` (association_scope.rb:23). Rails' unscoped
    // bypasses default_scope but STILL applies the STI `type_condition`
    // because `relation()` adds it for `finder_needs_type_condition?`
    // classes (`core.rb:431-435`). Our `Base.unscoped` doesn't wire STI
    // through `relation()` yet, so we re-add the type condition here.
    let scope: unknown = klass.unscoped();
    if (isStiSubclass(klass)) {
      const col = getInheritanceColumn(getStiBase(klass));
      if (col) {
        const stiNames = [klass.name, ...descendants(klass).map((d: typeof Base) => d.name)];
        scope = (scope as { where: (c: Record<string, unknown>) => unknown }).where({
          [col]: stiNames.length === 1 ? stiNames[0] : stiNames,
        });
      }
    }
    const chain = this._getChain(reflection);
    scope = this._addConstraints(scope, owner, chain, klass);
    if (!reflection.isCollection()) {
      scope = (scope as { limit: (n: number) => unknown }).limit(1);
    }
    return scope;
  }

  private _transformValue<T>(value: T): unknown {
    return this._valueTransformation(value);
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
  private _applyScope(scope: unknown, table: string | null, key: string, value: unknown): unknown {
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
  private _lastChainScope(
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
      const rawValue = owner.readAttribute(joinFks[i]);
      const value = this._transformValue(rawValue);
      scope = this._applyScope(scope, table, joinPks[i], value);
    }
    if (r.type) {
      // Rails: `owner.class.polymorphic_name` (returns base_class.name
      // for STI subclasses) routed through `transform_value`.
      const polyName = this._transformValue(polymorphicName(owner.constructor as typeof Base));
      scope = this._applyScope(scope, table, r.type, polyName);
    }
    return scope;
  }

  /**
   * Build the chain of reflections to walk. Rails wraps all-but-head in
   * `ReflectionProxy` with an aliased_table from `AliasTracker` so
   * repeated joins to the same table get unique aliases.
   *
   * PR 3 doesn't share an AliasTracker across calls (single-query through
   * loads typically don't collide), so each non-head reflection gets its
   * klass.tableName as the table identifier. Sharing a tracker for
   * repeated/eager-loaded joins is a follow-up.
   *
   * Mirrors: ActiveRecord::Associations::AssociationScope#get_chain
   * (association_scope.rb:112-122).
   */
  private _getChain(
    reflection: AssociationReflection,
  ): Array<AbstractReflection | ReflectionProxy> {
    const chain: Array<AbstractReflection | ReflectionProxy> = [reflection];
    const tail = reflection.chain.slice(1);
    for (const refl of tail) {
      const tableName =
        (refl as unknown as { klass?: { tableName?: string } }).klass?.tableName ?? "";
      // ReflectionProxy expects an AssociationReflection; tail entries
      // ARE AssociationReflection in the through case (the through-target
      // hasMany / belongsTo on the through model). Cast for the type
      // shape — the proxy only reads structural fields.
      chain.push(new ReflectionProxy(refl, tableName));
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
  private _nextChainScope(
    scope: unknown,
    reflection: AbstractReflection | ReflectionProxy,
    nextReflection: AbstractReflection | ReflectionProxy,
  ): unknown {
    const r = reflection as {
      joinPrimaryKey: string | string[];
      joinForeignKey: string | string[];
      klass?: { tableName?: string };
      type?: string | null;
    };
    const nr = nextReflection as {
      joinPrimaryKey: string | string[];
      joinForeignKey: string | string[];
      klass?: { tableName?: string };
      aliasedTable?: string | { name?: string };
    };
    const joinPks = Array.isArray(r.joinPrimaryKey) ? r.joinPrimaryKey : [r.joinPrimaryKey];
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
    const table = r.klass?.tableName ?? "";
    // nextReflection may be a ReflectionProxy (with aliasedTable) or a
    // raw reflection; resolve its table name the same way.
    const aliased = nr.aliasedTable;
    const foreignTable =
      typeof aliased === "string"
        ? aliased
        : aliased && typeof aliased === "object" && typeof aliased.name === "string"
          ? aliased.name
          : (nr.klass?.tableName ?? "");
    // Build the ON clause with proper identifier quoting (handles
    // schema-qualified names, embedded quotes, etc.) and Arel-style
    // value escaping for the polymorphic-type literal. JOIN ON in our
    // Relation is stored as a SQL string and re-wrapped in
    // Nodes.SqlLiteral at apply time, so we still produce a string —
    // but the identifiers/values are escape-safe.
    const qTable = quoteTableName(table);
    const qForeignTable = quoteTableName(foreignTable);
    const conditions: string[] = [];
    for (let i = 0; i < joinPks.length; i++) {
      conditions.push(
        `${qTable}.${quoteColumnName(joinPks[i])} = ${qForeignTable}.${quoteColumnName(joinFks[i])}`,
      );
    }
    let onClause = conditions.join(" AND ");
    if (r.type) {
      // Polymorphic through: filter the JOIN by the next reflection's
      // klass polymorphic name. Rails: `transform_value(next_reflection
      // .klass.polymorphic_name)` (association_scope.rb:91-93). Routes
      // through both `polymorphicName` (returns base_class.name for
      // STI) and the value-transformation lambda.
      const nextKlass = (nextReflection as { klass?: typeof Base }).klass;
      const nextName = nextKlass ? polymorphicName(nextKlass) : "";
      onClause += ` AND ${qTable}.${quoteColumnName(r.type)} = ${quote(this._transformValue(nextName))}`;
    }
    return (scope as { joins: (table: string, on: string) => unknown }).joins(
      foreignTable,
      onClause,
    );
  }

  /**
   * Fold `last_chain_scope` over the chain and merge any user-supplied
   * `scope` lambdas (reflection.scope / reflection.constraints) into the
   * relation. PR 1 applies the scope lambda on the tail only.
   *
   * Mirrors: ActiveRecord::Associations::AssociationScope#add_constraints
   * (association_scope.rb:124-159).
   */
  private _addConstraints(
    scope: unknown,
    owner: Base,
    chain: Array<AbstractReflection | ReflectionProxy>,
    klass?: typeof Base,
  ): unknown {
    const last = chain[chain.length - 1];
    scope = this._lastChainScope(scope, last, owner, klass);
    // For multi-step chains, walk pairs and add INNER JOINs — Rails'
    // `chain.each_cons(2) { |r, nr| next_chain_scope(scope, r, nr) }`
    // (association_scope.rb:128-130).
    for (let i = 0; i < chain.length - 1; i++) {
      scope = this._nextChainScope(scope, chain[i], chain[i + 1]);
    }
    // Use scopeFor (Rails: reflection.rb:448, scope_for) so 0-arity
    // scopes get `this`=relation, and >=1-arity scopes receive
    // (relation, owner) — matches Rails' `relation.instance_exec(owner,
    // &scope) || relation`. Calling `reflection.scope(scope)` directly
    // would lose the binding. The full Rails `add_constraints`
    // chain.reverseEach merges every reflection's constraints; for
    // chain-1 the simplified head-only path matches, and for through
    // chains we call scopeFor on the source reflection (chain[0])
    // matching Rails' behavior for the chain-head item.
    const scopeFor = (chain[0] as { scopeFor?: (rel: unknown, owner: unknown) => unknown })
      .scopeFor;
    if (typeof scopeFor === "function") {
      scope = scopeFor.call(chain[0], scope, owner);
    }
    return scope;
  }
}
