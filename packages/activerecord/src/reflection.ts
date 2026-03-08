import type { Base } from "./base.js";
import { modelRegistry } from "./associations.js";

/**
 * Represents metadata about an association.
 *
 * Mirrors: ActiveRecord::Reflection::AssociationReflection
 */
export class AssociationReflection {
  readonly name: string;
  readonly macro: "belongsTo" | "hasOne" | "hasMany" | "hasAndBelongsToMany";
  readonly options: Record<string, unknown>;
  readonly className: string;
  readonly foreignKey: string;

  constructor(
    name: string,
    macro: "belongsTo" | "hasOne" | "hasMany" | "hasAndBelongsToMany",
    options: Record<string, unknown>,
    ownerClass: typeof Base
  ) {
    this.name = name;
    this.macro = macro;
    this.options = options;

    // Derive className
    if (options.className) {
      this.className = options.className as string;
    } else if (macro === "hasMany" || macro === "hasAndBelongsToMany") {
      const singularize = (w: string) => {
        if (w.endsWith("ies")) return w.slice(0, -3) + "y";
        if (w.endsWith("ses") || w.endsWith("xes") || w.endsWith("zes")) return w.slice(0, -2);
        if (w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
        return w;
      };
      this.className = singularize(name).charAt(0).toUpperCase() + singularize(name).slice(1);
    } else {
      this.className = name.charAt(0).toUpperCase() + name.slice(1);
    }

    // Derive foreignKey
    if (options.foreignKey) {
      this.foreignKey = options.foreignKey as string;
    } else if (macro === "belongsTo") {
      this.foreignKey = `${name}_id`;
    } else {
      const underscore = (n: string) =>
        n.replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
          .replace(/([a-z\d])([A-Z])/g, "$1_$2")
          .toLowerCase();
      this.foreignKey = `${underscore(ownerClass.name)}_id`;
    }
  }

  isBelongsTo(): boolean {
    return this.macro === "belongsTo";
  }

  isHasOne(): boolean {
    return this.macro === "hasOne";
  }

  isHasMany(): boolean {
    return this.macro === "hasMany";
  }

  isCollection(): boolean {
    return this.macro === "hasMany" || this.macro === "hasAndBelongsToMany";
  }

  /**
   * Returns the target class of the association, resolved via the model registry.
   *
   * Mirrors: ActiveRecord::Reflection::AssociationReflection#klass
   */
  get klass(): typeof Base {
    const resolved = modelRegistry.get(this.className);
    if (!resolved) {
      throw new Error(`Could not find model '${this.className}' in model registry (for association '${this.name}')`);
    }
    return resolved;
  }
}

/**
 * Represents metadata about a column/attribute.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Column
 */
export class ColumnReflection {
  readonly name: string;
  readonly type: string;
  readonly defaultValue: unknown;

  constructor(name: string, type: string, defaultValue: unknown) {
    this.name = name;
    this.type = type;
    this.defaultValue = defaultValue;
  }
}

/**
 * Get all columns for a model class.
 *
 * Mirrors: ActiveRecord::Base.columns
 */
export function columns(modelClass: typeof Base): ColumnReflection[] {
  return Array.from(modelClass._attributeDefinitions.entries()).map(
    ([name, def]) => new ColumnReflection(name, def.type.constructor.name, def.defaultValue)
  );
}

/**
 * Get all column names for a model class.
 *
 * Mirrors: ActiveRecord::Base.column_names
 */
export function columnNames(modelClass: typeof Base): string[] {
  return Array.from(modelClass._attributeDefinitions.keys());
}

/**
 * Reflect on a specific association.
 *
 * Mirrors: ActiveRecord::Base.reflect_on_association
 */
export function reflectOnAssociation(
  modelClass: typeof Base,
  name: string
): AssociationReflection | null {
  const associations: any[] = (modelClass as any)._associations ?? [];
  const assocDef = associations.find((a: any) => a.name === name);
  if (!assocDef) return null;

  return new AssociationReflection(
    assocDef.name,
    assocDef.type as any,
    assocDef.options,
    modelClass
  );
}

/**
 * Reflect on all associations, optionally filtered by macro type.
 *
 * Mirrors: ActiveRecord::Base.reflect_on_all_associations
 */
export function reflectOnAllAssociations(
  modelClass: typeof Base,
  macro?: "belongsTo" | "hasOne" | "hasMany" | "hasAndBelongsToMany"
): AssociationReflection[] {
  const associations: any[] = (modelClass as any)._associations ?? [];
  const filtered = macro ? associations.filter((a) => a.type === macro) : associations;

  return filtered.map(
    (assocDef) =>
      new AssociationReflection(assocDef.name, assocDef.type as any, assocDef.options, modelClass)
  );
}
