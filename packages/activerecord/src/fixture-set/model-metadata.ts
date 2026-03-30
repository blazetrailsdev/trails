/**
 * Fixture model metadata — resolves model class info for fixtures.
 *
 * Mirrors: ActiveRecord::FixtureSet::ModelMetadata
 */

import { modelRegistry } from "../associations.js";

export class ModelMetadata {
  private _className: string;
  private _tableName: string;
  private _primaryKeyName: string;

  constructor(className: string, tableName?: string, primaryKeyName?: string) {
    this._className = className;

    const model = modelRegistry.get(className);
    this._tableName = tableName ?? (model as any)?.tableName ?? className.toLowerCase() + "s";
    this._primaryKeyName = primaryKeyName ?? (model as any)?.primaryKey ?? "id";
  }

  get className(): string {
    return this._className;
  }

  get tableName(): string {
    return this._tableName;
  }

  get primaryKeyName(): string {
    return this._primaryKeyName;
  }

  /**
   * Create ModelMetadata by looking up a registered model class.
   * Throws if the model is not registered.
   */
  static fromModel(className: string): ModelMetadata {
    const model = modelRegistry.get(className);
    if (!model) {
      throw new Error(
        `Model "${className}" not found in registry. Did you forget to call registerModel("${className}")?`,
      );
    }
    return new ModelMetadata(className);
  }
}
