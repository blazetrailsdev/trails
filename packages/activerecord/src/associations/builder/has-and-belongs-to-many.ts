import {
  foreignKey,
  underscore,
  singularize,
  pluralize,
  camelize,
  demodulize,
} from "@blazetrails/activesupport";
import { joinHabtmTableNames } from "../../associations.js";
import { ConfigurationError } from "../../errors.js";
import { HasMany } from "./has-many.js";

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
   * walking up from the left model, landing on the same class.
   *
   * @missingRailsCall call — PERMANENT: Language shortcoming: Rails invokes the resolver
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

    let tableName: string | null = null;
    const joinModel: any = class extends BaseClass {
      static leftModel: any;
      static tableNameResolver: () => string;
      static leftReflection: any;
      static rightReflection: any;

      /** @internal */
      static get tableName(): string {
        // Table name needs to be resolved lazily
        // because RHS class might not have been loaded
        return (tableName ??= this.tableNameResolver());
      }

      /** @internal */
      static set tableName(value: string) {
        tableName = value;
      }

      /** @internal The storage `Base` reads directly; one seat with the getter. */
      static get _tableName(): string | null {
        return tableName;
      }

      /** @internal */
      static set _tableName(value: string | null) {
        tableName = value;
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

    const ownerFk = this.options.foreignKey;
    if (Array.isArray(ownerFk)) {
      throw new ConfigurationError("HABTM associations do not support composite foreign keys");
    }

    Object.defineProperty(joinModel, "name", {
      value: `HABTM_${camelize(this.associationName)}`,
      writable: true,
      configurable: true,
    });
    joinModel.tableNameResolver = () => builder._tableName();
    joinModel.leftModel = lhsModel;

    // `Class.new(ActiveRecord::Base)` inherits Base's whole environment and the
    // join model's lexical nesting under the owner; a JS subclass of the
    // walked-up root inherits neither, so the module path (without which the
    // source `belongsTo` cannot resolve "Article" to "Publisher::Article") and
    // the connection seats below are set here.
    if (lhsModel.moduleName) {
      joinModel.moduleName = lhsModel.moduleName;
    }
    // `connection_pool` above is all Ruby needs; JS resolves the pool through
    // `_connectionSpecificationName` and reads `connection` / `adapter`
    // directly, so those delegate too.
    Object.defineProperty(joinModel, "connection", {
      get: () => lhsModel.connection,
      configurable: true,
    });
    Object.defineProperty(joinModel, "_connectionSpecificationName", {
      get: () => lhsModel.connectionSpecificationName,
      set: () => {},
      configurable: true,
    });
    Object.defineProperty(joinModel, "adapter", {
      get: () => lhsModel.connection,
      set: () => {},
      configurable: true,
    });

    // Rails passes `anonymous_class:` alone and lets the belongs_to derive
    // `left_side_id`, which no query reads: the through join uses the MIDDLE
    // has_many's key, derived from `lhs_model.name.demodulize`. A trails class
    // name is flattened (`Publisher::Article` → `PublisherArticle`), so the
    // owner key is resolved here off the Ruby leaf name instead.
    joinModel.addLeftAssociation("leftSide", {
      anonymousClass: lhsModel,
      foreignKey:
        ownerFk ?? `${underscore(demodulize(lhsModel._demodulizedName ?? lhsModel.name))}_id`,
    });
    joinModel.addRightAssociation(this.associationName, this.belongsToOptions(this.options));
    // A join table has no id column, and trails' delete/destroy issue PK-based
    // WHERE clauses where Rails' `delete_all(:delete_all)` builds its own.
    joinModel.primaryKey = [
      joinModel.leftReflection.foreignKey,
      joinModel.rightReflection.foreignKey,
    ];
    return joinModel;
  }

  middleReflection(joinModel: any): any {
    const lhsModelName = this.lhsModel.name.toLowerCase();
    const middleName = [pluralize(lhsModelName), this.associationName]
      .sort()
      .join("_")
      .replace(/::/g, "_");
    const middleOptions = this.middleOptions(joinModel);

    return HasMany.createReflection(this.lhsModel, middleName, null, middleOptions);
  }

  private middleOptions(joinModel: any): Record<string, unknown> {
    const middleOptions: Record<string, unknown> = {};
    middleOptions.className = `${this.lhsModel.name}::${joinModel.name}`;
    if (this.options.foreignKey) {
      middleOptions.foreignKey = this.options.foreignKey;
    } else {
      // Rails stops here and lets the middle has_many derive the owner key from
      // `lhs_model.name.demodulize`; a flattened JS class name cannot be
      // demodulized, so the key the join model already resolved is passed on
      // (see `through_model`'s `add_left_association`).
      middleOptions.foreignKey = joinModel.leftReflection.foreignKey;
    }
    // DEVIATION (trails-only, tracked by converge-constantize-ignores-private-constants):
    // Rails resolves the join model straight back out of the constant table —
    // `private_constant` blocks only a literal `A::B` reference, never
    // `const_get`, so `Object.const_get("Category::HABTM_Posts")` succeeds in
    // Ruby (verified on 3.3.11). trails' `constantize` raises for a private
    // name, so the join model is held directly and `klass` short-circuits
    // before any name lookup. `dependent` stands in for the
    // `delete_all(:delete_all)` Rails writes into `destroy_associations`.
    middleOptions.anonymousClass = joinModel;
    middleOptions.dependent = "delete";
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
