import { underscore, singularize, pluralize, camelize } from "@blazetrails/activesupport";

/**
 * Builder for has_and_belongs_to_many associations. Internally creates
 * a has_many :through with an anonymous join model.
 *
 * Mirrors: ActiveRecord::Associations::Builder::HasAndBelongsToMany
 */
export class HasAndBelongsToMany {
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
    new this().build(model, name, options, deps);
  }

  build(
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

    const middleName = [pluralize(underscore(model.name).toLowerCase()), name].sort().join("_");
    model._associations.push({
      type: "hasMany",
      name: middleName,
      options: {
        className: registryKey,
        foreignKey: ownerFk,
        dependent: "delete",
      },
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
