import { block, fetch, rbFSend, rbModName } from "@blazetrails/ruby-compat";
import type { Base } from "../../base.js";
import { foreignKey, singularize, pluralize, camelize } from "@blazetrails/activesupport";
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
    const joinModel: any = class extends ActiveRecord.Base {
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
    joinModel.tableNameResolver = () => builder.tableName();
    joinModel.leftModel = lhsModel;

    joinModel.addLeftAssociation("leftSide", { anonymousClass: lhsModel });
    joinModel.addRightAssociation(this.associationName, this.belongsToOptions(this.options));
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
    middleOptions.className = `${rbModName(this.lhsModel)}::${joinModel.name}`;
    if ("foreignKey" in this.options) {
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

  private tableName(): string {
    if (this.options.joinTable) {
      return String(this.options.joinTable);
    } else {
      const className = fetch<unknown>(
        this.options,
        "className",
        block(() => singularize(camelize(this.associationName))),
      );
      const klass = rbFSend(this.lhsModel, "computeType", String(className)) as typeof Base;
      return [this.lhsModel.tableName, klass.tableName]
        .sort()
        .join("\0")
        .replace(/^(.*[._])(.+)\0\1(.+)/m, "$1$2_$3")
        .replaceAll("\0", "_");
    }
  }
}
