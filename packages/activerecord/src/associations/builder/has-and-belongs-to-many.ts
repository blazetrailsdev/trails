import {
  underscore,
  singularize,
  pluralize,
  camelize,
  demodulize,
} from "@blazetrails/activesupport";
import { beforeDestroy } from "../../callbacks.js";
import * as Reflection from "../../reflection.js";
import { habtmTargetFk, joinHabtmTableNames } from "../../associations.js";
import { CollectionAssociation as CollectionAssociationBuilder } from "./collection-association.js";

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

  throughModel(): any {
    const lhsModel = this.lhsModel;
    const associationName = this.associationName;
    const options = this.options;

    const joinModelName = `HABTM_${camelize(associationName)}`;
    const tableName = this._tableName();
    const rightName = singularize(associationName);

    const joinModel: any = {
      name: joinModelName,
      leftModel: lhsModel,
      _tableName: tableName,
      _associations: [],
      _reflections: {},
      leftReflection: null as any,
      rightReflection: null as any,

      get tableName() {
        return this._tableName;
      },

      computeType(className: string) {
        return lhsModel.computeType?.(className) ?? null;
      },

      connectionPool() {
        return lhsModel.connectionPool?.() ?? null;
      },
    };

    joinModel.leftReflection = {
      name: "leftSide",
      type: "belongsTo",
      options: { anonymousClass: lhsModel },
    };
    joinModel._associations.push(joinModel.leftReflection);

    const rhsOptions: Record<string, unknown> = {};
    if (options.className) {
      rhsOptions.foreignKey = `${underscore(demodulize(options.className as string))}_id`;
      rhsOptions.className = options.className;
    }
    if (options.associationForeignKey) {
      rhsOptions.foreignKey = options.associationForeignKey;
    }

    joinModel.rightReflection = {
      name: rightName,
      type: "belongsTo",
      options: { ...rhsOptions },
    };
    joinModel._associations.push(joinModel.rightReflection);

    return joinModel;
  }

  middleReflection(joinModel: any): any {
    const lhsModelName = this.lhsModel.name.toLowerCase();
    const middleName = [pluralize(lhsModelName), this.associationName].sort().join("_");

    const middleOptions: Record<string, unknown> = {};
    middleOptions.className = `${this.lhsModel.name}::${joinModel.name}`;
    if (this.options.foreignKey) {
      middleOptions.foreignKey = this.options.foreignKey;
    }

    return {
      name: middleName,
      macro: "hasMany",
      scope: null,
      options: middleOptions,
      activeRecord: this.lhsModel,
    };
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
    options: Record<string, unknown>,
    deps: {
      defaultJoinTableName: (model: any, name: string, options?: { className?: string }) => string;
      singleFk: (fk: string | string[] | undefined, fallback: string) => string;
      createHabtmJoinModel: (...args: any[]) => any;
      modelRegistry: Map<string, any>;
    },
  ): void {
    new this(name, model, options)._build(deps);
  }

  private _build(deps: {
    defaultJoinTableName: (model: any, name: string, options?: { className?: string }) => string;
    singleFk: (fk: string | string[] | undefined, fallback: string) => string;
    createHabtmJoinModel: (...args: any[]) => any;
    modelRegistry: Map<string, any>;
  }): void {
    const model = this.lhsModel;
    const name = this.associationName;
    const options = this.options;

    if (!Object.prototype.hasOwnProperty.call(model, "_associations")) {
      model._associations = [...(model._associations ?? [])];
    }

    const targetClassName = (options.className as string) ?? camelize(singularize(name));
    const joinTableName =
      (options.joinTable as string) ??
      deps.defaultJoinTableName(model, name, {
        className: options.className as string | undefined,
      });
    const ownerFk = deps.singleFk(
      options.foreignKey as string | string[] | undefined,
      `${underscore(model.name)}_id`,
    );
    const targetFk = habtmTargetFk(name, options);

    const joinModelName = `HABTM_${camelize(name)}`;
    const registryKey = `${model.name}::${joinModelName}`;
    const sourceName = singularize(name);
    const JoinModel = deps.createHabtmJoinModel(
      model,
      joinModelName,
      joinTableName,
      ownerFk,
      targetFk,
      targetClassName,
      sourceName,
    );

    deps.modelRegistry.set(registryKey, JoinModel);

    const middleName = [pluralize(model.name.toLowerCase()), name].sort().join("_");
    const middleOptions: Record<string, unknown> = {
      className: registryKey,
      foreignKey: ownerFk,
      dependent: "delete",
    };
    model._associations.push({
      type: "hasMany",
      name: middleName,
      options: middleOptions,
    });
    const middleReflection = Reflection.create("hasMany", middleName, null, middleOptions, model);
    Reflection.addReflection(model, middleName, middleReflection as any);

    // Mirrors Rails associations.rb:1886-1894 — instead of registering a
    // bare `before_destroy` callback per HABTM, Rails includes an anonymous
    // module that overrides `destroy_associations` and chains with `super`.
    // Each HABTM declaration layers its own override; multiple HABTMs on
    // the same class chain naturally through the captured `prev` reference.
    // Translation note: `destroyAssociations` isn't yet wired into the
    // standard destroy flow (see Batch 37), so we still register a
    // class-level `beforeDestroy` once that invokes it — this preserves
    // current behavior while installing the Rails-shape override module.
    // Per-association guard: re-declaring the same HABTM (same `name` on
    // the same class) would otherwise layer a duplicate wrapper around the
    // existing chain, causing the join cleanup to run twice. Track the set
    // of names already wrapped on this class's prototype and short-circuit.
    const HABTM_WRAPPED_NAMES = Symbol.for("blazetrails.habtm.destroyAssociations.names");
    const ownWrappedNames: Set<string> = Object.prototype.hasOwnProperty.call(
      model.prototype,
      HABTM_WRAPPED_NAMES,
    )
      ? (model.prototype as any)[HABTM_WRAPPED_NAMES]
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
      model.prototype.destroyAssociations = async function (this: any): Promise<void> {
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
    const HABTM_DESTROY_INSTALLED = Symbol.for("blazetrails.habtm.destroyAssociations.installed");
    // Use `in` (inheritance walk) rather than own-property: when a subclass
    // declares its own HABTM, the parent already installed a bridge that the
    // callback engine COW'd into the subclass's chain. Installing a second
    // bridge on the subclass would dispatch `destroyAssociations` twice,
    // running the full chained override stack twice (duplicate cleanup).
    if (!(HABTM_DESTROY_INSTALLED in model)) {
      Object.defineProperty(model, HABTM_DESTROY_INSTALLED, {
        value: true,
        configurable: true,
        writable: false,
      });
      beforeDestroy(model, (record: any) => record.destroyAssociations());
    }

    // Tightened option set forwarded to the public HABTM reflection.
    // Rails' `hm_options` allowlist for the generated `has_many :through`
    // is the canonical set: before/after_add/remove, autosave, validate,
    // join_table, class_name, extend, strict_loading (associations.rb:1899).
    // We additionally retain `foreignKey` because our public HABTM
    // reflection plays the dual role Rails splits between
    // `habtm_reflection` (which keeps the full options) and the generated
    // through-`has_many` — join-key resolution (`_resolveHabtmJoin`,
    // `loadHabtm`) reads this directly off the public reflection.
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
    // Note: `joinTable` is intentionally NOT forwarded — `joinTableName`
    // (set above) already resolves `options.joinTable ?? default`, so the
    // value is captured. Re-forwarding would also overwrite it with
    // `undefined` when callers pass `joinTable: undefined` explicitly.
    // `associationForeignKey` is retained on the reflection options to
    // mirror Rails' `habtm_reflection` (which keeps the full options
    // hash); note however that `_build`, `_resolveHabtmJoin`, and
    // `loadHabtm` currently hard-code the target FK as
    // `${singular(name)}_id` — full plumbing into the generated join
    // model and join SQL is a follow-up.
    const habtmOptions: Record<string, unknown> = {
      joinTable: joinTableName,
      through: middleName,
      source: (options.source as string) ?? singularize(name),
    };
    for (const k of HABTM_FORWARDED_KEYS) {
      if (Object.prototype.hasOwnProperty.call(options, k)) {
        habtmOptions[k] = options[k];
      }
    }
    // `scope:` is captured as a positional reflection arg below, but keep
    // it on the options bag too for callers that bypass reflection.
    if (typeof options.scope === "function") {
      habtmOptions.scope = options.scope;
    }
    model._associations.push({
      type: "hasAndBelongsToMany",
      name,
      options: habtmOptions,
    });
    // Pull `scope:` off the options bag and forward it as the dedicated
    // scope arg on the reflection. Mirrors Rails' Builder::Association,
    // which captures `scope` as a positional arg to `has_and_belongs_to_many`
    // rather than treating it as a generic option. `loadHabtm` (and the
    // through-routing loaders) already check `options.scope` — keeping it
    // there too means callers who don't go through reflection still see it.
    const habtmScope =
      typeof habtmOptions.scope === "function"
        ? (habtmOptions.scope as (...args: any[]) => any)
        : null;
    // Keep `through:` in the options passed to Reflection.create so it wraps
    // the HasAndBelongsToManyReflection in a ThroughReflection — mirrors
    // Rails' `Builder::HasAndBelongsToMany`, which builds an internal
    // has_many :through and registers the HABTM as a through reflection.
    const { scope: _scope, ...habtmReflectionOptions } = habtmOptions;
    const habtmReflection = Reflection.create(
      "hasAndBelongsToMany" as any,
      name,
      habtmScope,
      habtmReflectionOptions,
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
  return (builder as any)._middleOptions?.(joinModel) ?? {};
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
  return (builder as any)._belongsToOptions?.(options) ?? {};
}
