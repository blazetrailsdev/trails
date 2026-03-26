/**
 * Base class for association builders. Configures association metadata
 * (reflection, callbacks, validations) based on options.
 *
 * Mirrors: ActiveRecord::Associations::Builder::Association
 */
export class Association {
  static validOptions(_options: Record<string, unknown>): string[] {
    return [
      "className",
      "foreignKey",
      "validate",
      "autosave",
      "dependent",
      "primaryKey",
      "inverseOf",
      "strictLoading",
      "ensuringOwnerWas",
      "queryConstraints",
    ];
  }

  static build(model: any, name: string, options: Record<string, unknown> = {}): void {
    new this().build(model, name, options);
  }

  build(model: any, name: string, options: Record<string, unknown>): void {
    this.ensureOwnAssociations(model);
    this.defineAssociation(model, name, options);
  }

  protected ensureOwnAssociations(model: any): void {
    if (!Object.prototype.hasOwnProperty.call(model, "_associations")) {
      model._associations = [...(model._associations ?? [])];
    }
  }

  protected defineAssociation(_model: any, _name: string, _options: Record<string, unknown>): void {
    // Subclasses push the appropriate AssociationDefinition
  }
}
