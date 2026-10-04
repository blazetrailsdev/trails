import { hasKey, rbModName } from "@blazetrails/ruby-compat";
import {
  foreignKey,
  underscore,
  singularize,
  pluralize,
  camelize,
  demodulize,
} from "@blazetrails/activesupport";
import { joinHabtmTableNames } from "../../associations.js";
import { ActiveRecord } from "../../namespaces.js";
import { HasMany } from "./has-many.js";

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
    const builder = this;
    const lhsModel = this.lhsModel;

    let tableName: string | null = null;
    const joinModel: any = class extends (ActiveRecord.Base as any) {
      static leftModel: any;
      static tableNameResolver: () => string;
      static leftReflection: any;
      static rightReflection: any;

      /** @internal */
      static get tableName(): string {
        return (tableName ??= this.tableNameResolver());
      }

      /** @internal */
      static set tableName(value: string) {
        tableName = value;
      }

      /** @internal */
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

    Object.defineProperty(joinModel, "name", {
      value: `HABTM_${camelize(this.associationName)}`,
      writable: true,
      configurable: true,
    });
    joinModel.tableNameResolver = () => builder._tableName();
    joinModel.leftModel = lhsModel;

    joinModel.addLeftAssociation("leftSide", {
      anonymousClass: lhsModel,
      foreignKey: this.options.foreignKey ?? `${underscore(demodulize(rbModName(lhsModel)!))}_id`,
    });
    joinModel.addRightAssociation(this.associationName, this.belongsToOptions(this.options));
    joinModel.primaryKey = [
      joinModel.leftReflection.foreignKey(),
      joinModel.rightReflection.foreignKey(),
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
    if (hasKey(this.options, "foreignKey")) {
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
