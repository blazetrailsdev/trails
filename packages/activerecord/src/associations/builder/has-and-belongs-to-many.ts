import {
  foreignKey,
  underscore,
  singularize,
  pluralize,
  camelize,
  demodulize,
  privateConstant,
} from "@blazetrails/activesupport";
import * as Reflection from "../../reflection.js";
import { habtmTargetFk, joinHabtmTableNames } from "../../associations.js";
import { CollectionAssociation as CollectionAssociationBuilder } from "./collection-association.js";
import { HasMany } from "./has-many.js";
import { addAutosaveAssociationCallbacks } from "../../autosave-association.js";

/**
 * Builder for has_and_belongs_to_many associations. Internally creates
 * a has_many :through with an anonymous join model.
 *
 * Mirrors: ActiveRecord::Associations::Builder::HasAndBelongsToMany
 */
export class HasAndBelongsToMany {
  readonly lhsModel: any;
  readonly associationName: string;
  readonly options: Record<string, unknown>;

  constructor(associationName: string, lhsModel: any, options: Record<string, unknown>) {
    this.associationName = associationName;
    this.lhsModel = lhsModel;
    this.options = options;
  }

  /**
   * Mirrors `Builder::HasAndBelongsToMany#through_model`
   * (has_and_belongs_to_many.rb:13-56).
   *
   * Rails writes `Class.new(ActiveRecord::Base)`; this builder cannot import
   * `Base` without closing an import cycle, so the root AR class is reached by
   * walking up from the left model — the same walk `createHabtmJoinModel`
   * (associations.ts) does, landing on the same class.
   *
   * @missingRailsCall call — Language shortcoming: Rails invokes the resolver
   * lambda as `table_name_resolver.call`; JS functions have no `call`-named
   * invocation of their own (`Function.prototype.call` rebinds `this` and is a
   * different method), so `this.tableNameResolver()` IS the same call.
   */
  throughModel(): any {
    const builder = this;
    const lhsModel = this.lhsModel;

    let BaseClass: any = lhsModel;
    let parent = Object.getPrototypeOf(BaseClass);
    while (parent && parent !== Function.prototype && typeof parent.create === "function") {
      BaseClass = parent;
      parent = Object.getPrototypeOf(BaseClass);
    }

    const joinModel: any = class extends BaseClass {
      static leftModel: any;
      static tableNameResolver: () => string;
      static leftReflection: any;
      static rightReflection: any;

      /** @internal */
      static get tableName(): string {
        // Table name needs to be resolved lazily
        // because RHS class might not have been loaded
        return (this._tableName ??= this.tableNameResolver());
      }

      /** @internal */
      static set tableName(value: string) {
        this._tableName = value;
      }

      static computeType(className: string): any {
        return this.leftModel.computeType(className);
      }

      static addLeftAssociation(name: string, options: Record<string, unknown>): void {
        this.belongsTo(name, { required: false, ...options });
        this.leftReflection = this._reflectOnAssociation(name);
      }

      static addRightAssociation(name: string, options: Record<string, unknown>): void {
        const rhsName = singularize(name);
        this.belongsTo(rhsName, { required: false, ...options });
        this.rightReflection = this._reflectOnAssociation(rhsName);
      }

      static connectionPool(): any {
        return this.leftModel.connectionPool();
      }
    };
    joinModel._tableName = null;

    Object.defineProperty(joinModel, "name", {
      value: `HABTM_${camelize(this.associationName)}`,
      writable: true,
      configurable: true,
    });
    joinModel.tableNameResolver = () => builder._tableName();
    joinModel.leftModel = lhsModel;

    joinModel.addLeftAssociation("leftSide", { anonymousClass: lhsModel });
    joinModel.addRightAssociation(this.associationName, this.belongsToOptions(this.options));
    return joinModel;
  }

  middleReflection(joinModel: any): any {
    const lhsModelName = this.lhsModel.name.toLowerCase();
    const middleName = [pluralize(lhsModelName), this.associationName].sort().join("_");
    const middleOptions = this.middleOptions(joinModel);

    return HasMany.createReflection(this.lhsModel, middleName, null, middleOptions);
  }

  private middleOptions(joinModel: any): Record<string, unknown> {
    const middleOptions: Record<string, unknown> = {};
    middleOptions.className = `${this.lhsModel.name}::${joinModel.name}`;
    if (this.options.foreignKey) {
      middleOptions.foreignKey = this.options.foreignKey;
    }
    return middleOptions;
  }

  private belongsToOptions(options: Record<string, unknown>): Record<string, unknown> {
    const rhsOptions: Record<string, unknown> = {};

    if (options.className) {
      rhsOptions.foreignKey = foreignKey(options.className as string);
      rhsOptions.className = options.className;
    }

    if (options.associationForeignKey) {
      rhsOptions.foreignKey = options.associationForeignKey;
    }

    return rhsOptions;
  }

  private _fallbackTableName(name: string): string {
    return underscore(pluralize(name)).replace(/\//g, "_");
  }

  private _tableName(): string {
    if (this.options.joinTable) {
      return this.options.joinTable as string;
    }
    const className =
      (this.options.className as string) ?? camelize(singularize(this.associationName));
    const lhsTable = this.lhsModel.tableName ?? this._fallbackTableName(this.lhsModel.name);

    let rhsTable: string;
    if (typeof this.lhsModel.computeType === "function") {
      try {
        const klass = this.lhsModel.computeType(className);
        rhsTable = klass?.tableName ?? this._fallbackTableName(className);
      } catch {
        rhsTable = this._fallbackTableName(className);
      }
    } else {
      rhsTable = this._fallbackTableName(className);
    }

    return joinHabtmTableNames(lhsTable, rhsTable);
  }

  static build(
    model: any,
    name: string,
    scope: ((...args: any[]) => any) | null,
    options: Record<string, unknown>,
    deps: {
      defaultJoinTableName: (model: any, name: string, options?: { className?: string }) => string;
      singleFk: (fk: string | string[] | undefined, fallback: string) => string;
      createHabtmJoinModel: (...args: any[]) => any;
      modelRegistry: Map<string, any>;
    },
  ): void {
    new this(name, model, options)._build(deps, scope);
  }

  private _build(
    deps: {
      defaultJoinTableName: (model: any, name: string, options?: { className?: string }) => string;
      singleFk: (fk: string | string[] | undefined, fallback: string) => string;
      createHabtmJoinModel: (...args: any[]) => any;
      modelRegistry: Map<string, any>;
    },
    scope: ((...args: any[]) => any) | null = null,
  ): void {
    const model = this.lhsModel;
    const name = this.associationName;
    const options = this.options;

    const targetClassName = (options.className as string) ?? camelize(singularize(name));
    let memoizedJoinTableName: string | undefined;
    const joinTableNameResolver = (): string =>
      (memoizedJoinTableName ??=
        (options.joinTable as string) ??
        deps.defaultJoinTableName(model, name, {
          className: options.className as string | undefined,
        }));
    // Rails derives the owner join key from the demodulized class name, so a
    // namespaced owner like `Publisher::Article` yields `article_id`, not
    // `publisher_article_id`. `_demodulizedName` carries the Ruby leaf name for
    // models whose flattened JS class name differs; fall back to `model.name`.
    const ownerLeafName = model._demodulizedName ?? model.name;
    const ownerFk = deps.singleFk(
      options.foreignKey as string | string[] | undefined,
      `${underscore(demodulize(ownerLeafName))}_id`,
    );
    const targetFk = habtmTargetFk(name, options);

    const joinModelName = `HABTM_${camelize(name)}`;
    const registryKey = `${model.name}::${joinModelName}`;
    // Rails' `add_right_association` always names the join-model `belongs_to`
    // from the association name via `name.to_s.singularize` — even when
    // `class_name:` is set (e.g. `other_posts, class_name: "Post"` yields
    // `belongs_to :other_post, class_name: "Post", foreign_key: "post_id"`).
    // `source_reflection_names` then resolves the through `source:` via the same
    // `singularize(assoc_name)`. The class-name-derived foreign key (`post_id`)
    // is carried by `targetFk` (`habtmTargetFk`), passed to the join model below.
    const sourceName = singularize(name);
    const JoinModel = deps.createHabtmJoinModel(
      model,
      joinModelName,
      joinTableNameResolver,
      ownerFk,
      targetFk,
      targetClassName,
      sourceName,
    );

    deps.modelRegistry.set(registryKey, JoinModel);
    privateConstant(registryKey);

    const middleName = [pluralize(model.name.toLowerCase()), name].sort().join("_");
    const middleOptions: Record<string, unknown> = {
      className: registryKey,
      // DEVIATION (trails-only, tracked by converge-constantize-ignores-private-constants):
      // Rails sets only `class_name` here (has_and_belongs_to_many.rb:73) and
      // resolves the join model straight back out of the constant table —
      // `private_constant` blocks only a literal `A::B` reference, never
      // `const_get`, so `Object.const_get("Category::HABTM_Posts")` succeeds in
      // Ruby (verified on 3.3.11). trails' `constantize` raises for a private
      // name, which it should not; until that is fixed, hold the join model
      // directly so `klass` short-circuits before any name lookup. `className`
      // stays exactly as Rails spells it.
      anonymousClass: JoinModel,
      foreignKey: ownerFk,
      dependent: "delete",
    };
    model._associations = [
      ...model._associations,
      { type: "hasMany", name: middleName, options: middleOptions },
    ];
    const middleReflection = Reflection.create("hasMany", middleName, null, middleOptions, model);
    // Rails: `Builder::HasMany.define_callbacks self, middle_reflection`
    // (associations.rb:1878); AutosaveAssociation is one of its extensions.
    addAutosaveAssociationCallbacks.call(model, middleReflection);
    Reflection.addReflection(model, middleName, middleReflection as any);

    // Mirrors Rails associations.rb:1886-1894 — instead of registering a
    // bare `before_destroy` callback per HABTM, Rails includes an anonymous
    // module that overrides `destroy_associations` and chains with `super`.
    // Each HABTM declaration layers its own override; multiple HABTMs on
    // the same class chain naturally through the captured `prev` reference.
    // `destroyAssociations` is invoked by the standard destroy flow
    // (`Base#_destroyRow` → after before_destroy, before the row delete), so
    // this override is all that's needed — no `before_destroy` bridge.
    // Per-association guard: re-declaring the same HABTM (same `name` on
    // the same class) would otherwise layer a duplicate wrapper around the
    // existing chain, causing the join cleanup to run twice. Track the set
    // of names already wrapped on this class's prototype and short-circuit.
    const HABTM_WRAPPED_NAMES = Symbol.for("blazetrails.habtm.destroyAssociations.names");
    const ownWrappedNames: Set<string> = Object.prototype.hasOwnProperty.call(
      model.prototype,
      HABTM_WRAPPED_NAMES,
    )
      ? model.prototype[HABTM_WRAPPED_NAMES]
      : Object.defineProperty(model.prototype, HABTM_WRAPPED_NAMES, {
          value: new Set<string>(),
          configurable: true,
          writable: false,
        })[HABTM_WRAPPED_NAMES];
    const prevDestroyAssociations = model.prototype.destroyAssociations;
    if (ownWrappedNames.has(name)) {
      // Skip wrapper layering on redeclaration — the existing chain already
      // handles this association.
    } else {
      ownWrappedNames.add(name);
      model.prototype.destroyAssociations = async function (this: {
        association(n: string): { handleDependency(): Promise<void>; reset?(): void };
        _collectionProxies?: { delete(n: string): void };
      }): Promise<void> {
        await this.association(middleName).handleDependency();
        this.association(name).reset?.();
        // Rails' `association(:name).reset` only clears the Association
        // instance's loaded state. In this codebase, collection readers are
        // additionally memoized in `_collectionProxies` (see associations.ts
        // ~2334), so the user-facing reader would still return the stale
        // proxy unless we evict it too.
        this._collectionProxies?.delete(name);
        if (typeof prevDestroyAssociations === "function") {
          await prevDestroyAssociations.call(this);
        }
      };
    }

    // Tightened option set forwarded to the public HABTM reflection.
    // Rails' `hm_options` allowlist for the generated `has_many :through`
    // is the canonical set: before/after_add/remove, autosave, validate,
    // join_table, class_name, extend, strict_loading (associations.rb:1899).
    // We additionally retain `foreignKey` because our public HABTM
    // reflection plays the dual role Rails splits between
    // `habtm_reflection` (which keeps the full options) and the generated
    // through-`has_many` — join-key resolution (`_resolveHabtmJoin`) reads
    // this directly off the public reflection.
    // `primaryKey` is intentionally NOT forwarded: Rails'
    // `Builder::HasAndBelongsToMany` does not pass `:primary_key` to the
    // middle has_many or rhs belongs_to, so the owner join always uses
    // the model's primary key.
    // Spreading `...options` previously leaked `readonly`/`dependent`
    // into through-hasMany semantics — Rails drops those. `inverseOf` IS
    // retained because Rails' `habtm_reflection` is constructed with the
    // full options hash (associations.rb:1871) and consumers in this
    // codebase consult `reflection.options.inverseOf` for inverse caching.
    const HABTM_FORWARDED_KEYS = [
      "beforeAdd",
      "afterAdd",
      "beforeRemove",
      "afterRemove",
      "autosave",
      "validate",
      "className",
      "extend",
      "strictLoading",
      "foreignKey",
      "inverseOf",
      "indexErrors",
      "associationForeignKey",
    ] as const;
    // Note: a DERIVED join-table name is deliberately not written here.
    // Rails' `hm_options` allowlist forwards `:join_table` only when the
    // declaration supplied one (associations.rb:1899); with the key absent,
    // `HasAndBelongsToManyReflection#join_table` falls through to
    // `derive_join_table`, which reads `klass.table_name` when the reflection
    // is USED. Writing a derived name here instead resolved the RHS table at
    // declaration time — the eager resolution Rails' join model documents
    // against ("Table name needs to be resolved lazily because RHS class might
    // not have been loaded", has_and_belongs_to_many.rb:25-26), and with the
    // RHS unregistered it latched the name-derived fallback for good.
    // `associationForeignKey` is retained on the reflection options to
    // mirror Rails' `habtm_reflection` (which keeps the full options
    // hash); note however that `_build` and `_resolveHabtmJoin` currently
    // hard-code the target FK as `${singular(name)}_id` — full plumbing into
    // the generated join model and join SQL is a follow-up.
    const habtmOptions: Record<string, unknown> = {
      through: middleName,
      source: (options.source as string) ?? sourceName,
    };
    if (options.joinTable != null) habtmOptions.joinTable = options.joinTable;
    for (const k of HABTM_FORWARDED_KEYS) {
      if (Object.prototype.hasOwnProperty.call(options, k)) {
        habtmOptions[k] = options[k];
      }
    }
    const positionalScope = typeof scope === "function" ? scope : null;
    model._associations = [
      ...model._associations,
      { type: "hasAndBelongsToMany", name, scope: positionalScope, options: habtmOptions },
    ];
    // Register before/after_add/remove class properties for Rails parity —
    // mirrors CollectionAssociation.defineCallbacks for has_many. The bug-fix
    // in defineCallback ensures a subclass that redefines the HABTM without
    // callbacks shadows the parent's array (own [] vs inherited [fn]).
    for (const callbackName of ["beforeAdd", "afterAdd", "beforeRemove", "afterRemove"] as const) {
      CollectionAssociationBuilder.defineCallback(model, callbackName, name, habtmOptions);
    }
    // Keep `through:` in the options passed to Reflection.create so it wraps
    // the HasAndBelongsToManyReflection in a ThroughReflection — mirrors
    // Rails' `Builder::HasAndBelongsToMany`, which builds an internal
    // has_many :through and registers the HABTM as a through reflection.
    const habtmReflection = Reflection.create(
      "hasAndBelongsToMany" as any,
      name,
      positionalScope,
      habtmOptions,
      model,
    );
    Reflection.addReflection(model, name, habtmReflection as any);
    // Mirrors Rails' `middle_reflection.parent_reflection = habtm_reflection`
    // — the through middle is owned by the public HABTM reflection. Some
    // reflection-walking code paths (e.g. nested-through resolution and
    // inverse lookup) inspect this link.
    (middleReflection as any).parentReflection = habtmReflection;
    CollectionAssociationBuilder.defineAccessors(model, habtmReflection);
  }
}

/** @internal */
function middleOptions(builder: HasAndBelongsToMany, joinModel: unknown): Record<string, unknown> {
  return (builder as any).middleOptions(joinModel);
}

/** @internal */
function tableName(builder: HasAndBelongsToMany): string {
  return (builder as any)._tableName?.() ?? "";
}

/** @internal */
function belongsToOptions(
  builder: HasAndBelongsToMany,
  options: Record<string, unknown>,
): Record<string, unknown> {
  return (builder as any).belongsToOptions(options);
}
