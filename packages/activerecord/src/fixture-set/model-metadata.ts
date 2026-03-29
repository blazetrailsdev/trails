/**
 * Fixture model metadata — resolves model class info for fixtures.
 *
 * Mirrors: ActiveRecord::FixtureSet::ModelMetadata
 */

export class ModelMetadata {
  private _className: string;
  private _tableName: string;
  private _primaryKeyName: string;

  constructor(className: string, tableName: string, primaryKeyName = "id") {
    this._className = className;
    this._tableName = tableName;
    this._primaryKeyName = primaryKeyName;
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
}
