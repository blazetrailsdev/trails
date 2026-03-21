import type { Base } from "./base.js";
import { underscore, pluralize } from "@rails-ts/activesupport";
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
    ownerClass: typeof Base,
  ) {
    this.name = name;
    this.macro = macro;
    this.options = options;
    this._ownerClass = ownerClass;

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
      this.foreignKey = `${underscore(name)}_id`;
    } else {
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
   * For polymorphic associations, returns the type column name.
   *
   * Mirrors: ActiveRecord::Reflection::AssociationReflection#foreign_type
   */
  get foreignType(): string | null {
    if (!this.options.polymorphic && !this.options.as) return null;
    if (this.macro === "belongsTo") {
      return `${underscore(this.name)}_type`;
    }
    if (this.options.as) {
      return `${underscore(this.options.as as string)}_type`;
    }
    return null;
  }

  /**
   * For HABTM associations, returns the join table name.
   *
   * Mirrors: ActiveRecord::Reflection::AssociationReflection#join_table
   */
  get joinTable(): string | null {
    if (this.macro !== "hasAndBelongsToMany") return null;
    if (this.options.joinTable) return this.options.joinTable as string;
    const ownerKey = pluralize(underscore(this._ownerClass.name));
    const assocKey = underscore(this.name);
    return [ownerKey, assocKey].sort().join("_");
  }

  isThrough(): boolean {
    return false;
  }

  private _ownerClass: typeof Base;

  /**
   * Returns the target class of the association, resolved via the model registry.
   *
   * Mirrors: ActiveRecord::Reflection::AssociationReflection#klass
   */
  get klass(): typeof Base {
    const resolved = modelRegistry.get(this.className);
    if (!resolved) {
      throw new Error(
        `Could not find model '${this.className}' in model registry (for association '${this.name}')`,
      );
    }
    return resolved;
  }
}

/**
 * Represents a through association reflection.
 *
 * Mirrors: ActiveRecord::Reflection::ThroughReflection
 */
export class ThroughReflection extends AssociationReflection {
  readonly through: string;
  readonly source: string;

  constructor(
    name: string,
    macro: "hasOne" | "hasMany",
    options: Record<string, unknown>,
    ownerClass: typeof Base,
  ) {
    super(name, macro, options, ownerClass);
    this.through = options.through as string;
    this.source = (options.source as string) ?? name;
  }

  isThrough(): boolean {
    return true;
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
    ([name, def]) => new ColumnReflection(name, def.type.constructor.name, def.defaultValue),
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
 * Get content columns as ColumnReflection objects.
 * Delegates to Base.contentColumns() which excludes PK, FK (_id suffix), and timestamps.
 *
 * Mirrors: ActiveRecord::Base.content_columns
 */
export function contentColumns(modelClass: typeof Base): ColumnReflection[] {
  const contentNames = new Set(modelClass.contentColumns());
  return columns(modelClass).filter((col) => contentNames.has(col.name));
}

/**
 * Reflect on a specific association.
 *
 * Mirrors: ActiveRecord::Base.reflect_on_association
 */
export function reflectOnAssociation(
  modelClass: typeof Base,
  name: string,
): AssociationReflection | null {
  const associations: any[] = (modelClass as any)._associations ?? [];
  const assocDef = associations.find((a: any) => a.name === name);
  if (!assocDef) return null;

  if (
    assocDef.options.through ||
    assocDef.type === "hasManyThrough" ||
    assocDef.type === "hasOneThrough"
  ) {
    const macro =
      assocDef.type === "hasOneThrough" || assocDef.type === "hasOne" ? "hasOne" : "hasMany";
    return new ThroughReflection(assocDef.name, macro, assocDef.options, modelClass);
  }

  return new AssociationReflection(
    assocDef.name,
    assocDef.type as any,
    assocDef.options,
    modelClass,
  );
}

/**
 * Reflect on all associations, optionally filtered by macro type.
 *
 * Mirrors: ActiveRecord::Base.reflect_on_all_associations
 */
export function reflectOnAllAssociations(
  modelClass: typeof Base,
  macro?: "belongsTo" | "hasOne" | "hasMany" | "hasAndBelongsToMany",
): AssociationReflection[] {
  const associations: any[] = (modelClass as any)._associations ?? [];
  const filtered = macro
    ? associations.filter((a) => {
        if (a.options?.through || a.type === "hasManyThrough" || a.type === "hasOneThrough") {
          const normalized =
            a.type === "hasOneThrough" || a.type === "hasOne" ? "hasOne" : "hasMany";
          return normalized === macro;
        }
        return a.type === macro;
      })
    : associations;

  return filtered.map((assocDef) => {
    if (
      assocDef.options.through ||
      assocDef.type === "hasManyThrough" ||
      assocDef.type === "hasOneThrough"
    ) {
      const macro =
        assocDef.type === "hasOneThrough" || assocDef.type === "hasOne" ? "hasOne" : "hasMany";
      return new ThroughReflection(assocDef.name, macro, assocDef.options, modelClass);
    }
    return new AssociationReflection(
      assocDef.name,
      assocDef.type as any,
      assocDef.options,
      modelClass,
    );
  });
}
