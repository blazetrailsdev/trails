import {
  underscore,
  singularize,
  pluralize,
  camelize,
  demodulize,
} from "@blazetrails/activesupport";
import { beforeDestroy } from "../../callbacks.js";

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

    return [lhsTable, rhsTable].sort().join("_");
  }

  static build(
    model: any,
    name: string,
    options: Record<string, unknown>,
    deps: {
      defaultJoinTableName: (model: any, name: string) => string;
      singleFk: (fk: string | string[] | undefined, fallback: string) => string;
      createHabtmJoinModel: (...args: any[]) => any;
      modelRegistry: Map<string, any>;
    },
  ): void {
    new this(name, model, options)._build(deps);
  }

  private _build(deps: {
    defaultJoinTableName: (model: any, name: string) => string;
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
    const joinTableName = (options.joinTable as string) ?? deps.defaultJoinTableName(model, name);
    const ownerFk = deps.singleFk(
      options.foreignKey as string | string[] | undefined,
      `${underscore(model.name)}_id`,
    );
    const targetFk = `${underscore(singularize(name))}_id`;

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
    model._associations.push({
      type: "hasMany",
      name: middleName,
      options: {
        className: registryKey,
        foreignKey: ownerFk,
        dependent: "delete",
      },
    });

    beforeDestroy(model, (record: any) => {
      return record.association(middleName).handleDependency();
    });

    model._associations.push({
      type: "hasAndBelongsToMany",
      name,
      options: {
        ...options,
        joinTable: joinTableName,
        through: middleName,
        source: (options.source as string) ?? singularize(name),
      },
    });
  }
}
