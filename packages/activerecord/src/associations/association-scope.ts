import type { Base } from "../base.js";
import type { AssociationReflection, AbstractReflection } from "../reflection.js";
import { isStiSubclass, getStiBase, getInheritanceColumn, descendants } from "../inheritance.js";
import { CompositePrimaryKeyMismatchError } from "./errors.js";

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
  readonly reflection: AssociationReflection;
  readonly aliasedTable: unknown;

  constructor(reflection: AssociationReflection, aliasedTable: unknown) {
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
  // the shape.
  get joinPrimaryKey(): string | string[] {
    return this.reflection.joinPrimaryKey;
  }

  /**
   * Forwarding `joinPrimaryKeyFor(klass)` so AssociationScope's
   * runtime-klass path (polymorphic belongsTo) finds the correct
   * primary key column on the resolved target. Falls back to the
   * static `joinPrimaryKey` if the reflection doesn't expose it.
   */
  joinPrimaryKeyFor(klass?: typeof Base): string | string[] {
    const r = this.reflection as unknown as {
      joinPrimaryKeyFor?: (klass?: typeof Base) => string | string[];
    };
    return typeof r.joinPrimaryKeyFor === "function"
      ? r.joinPrimaryKeyFor(klass)
      : this.reflection.joinPrimaryKey;
  }

  get joinForeignKey(): string | string[] {
    return this.reflection.joinForeignKey;
  }

  get type(): string | null {
    return this.reflection.type;
  }

  get klass(): typeof Base {
    return this.reflection.klass;
  }

  get name(): string {
    return this.reflection.name;
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
      binds.push((owner.constructor as typeof Base).name);
    }
    for (let i = 0; i < chain.length - 1; i++) {
      const refl = chain[i];
      const next = chain[i + 1];
      if ((refl as { type?: string | null }).type) {
        binds.push((next as { klass?: { name: string } }).klass?.name ?? null);
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
   * relation.
   *
   * Mirrors: ActiveRecord::Associations::AssociationScope#apply_scope
   * (association_scope.rb:161-167).
   */
  private _applyScope(scope: unknown, _table: unknown, key: string, value: unknown): unknown {
    return (scope as { where: (c: Record<string, unknown>) => unknown }).where({
      [key]: value,
    });
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
    const table = (reflection as ReflectionProxy).aliasedTable ?? null;
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
      const polyName = this._transformValue((owner.constructor as typeof Base).name);
      scope = this._applyScope(scope, table, r.type, polyName);
    }
    return scope;
  }

  /**
   * Build the chain of reflections to walk. Rails uses `reflection.chain`
   * and wraps all-but-head in `ReflectionProxy` with aliased tables; for
   * chain length 1 the source reflection stands alone.
   *
   * Mirrors: ActiveRecord::Associations::AssociationScope#get_chain
   * (association_scope.rb:112-122). Multi-step wrapping comes in PR 3.
   */
  private _getChain(
    reflection: AssociationReflection,
  ): Array<AbstractReflection | ReflectionProxy> {
    if (reflection.chain.length > 1) {
      throw new Error(
        `AssociationScope: multi-step association chains are not implemented yet — ` +
          `reflection '${reflection.name}' has ${reflection.chain.length} chain entries`,
      );
    }
    return [reflection];
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
    // Use scopeFor (Rails: reflection.rb:448, scope_for) so 0-arity
    // scopes get `this`=relation, and >=1-arity scopes receive
    // (relation, owner) — matches Rails' `relation.instance_exec(owner,
    // &scope) || relation`. Calling `reflection.scope(scope)` directly
    // would lose the binding.
    const scopeFor = (last as { scopeFor?: (rel: unknown, owner: unknown) => unknown }).scopeFor;
    if (typeof scopeFor === "function") {
      scope = scopeFor.call(last, scope, owner);
    }
    return scope;
  }
}
