import { hasKey } from "@blazetrails/ruby-compat";
import type { Base } from "../base.js";
import { FixtureSet, type Fixture } from "../fixtures.js";
import { findStiClass } from "../inheritance.js";
import { allTimestampAttributesInModel } from "../timestamp.js";
import type { TableRows } from "./table-rows.js";
import type { ModelMetadata } from "./model-metadata.js";

interface FixtureReflection {
  name: string;
  macro: string;
  options: { through?: unknown };
  joinTable?: string;
  foreignKey: string | string[];
  joinForeignKey: string | string[];
  joinForeignType: string | null;
  joinPrimaryKey(): string | string[];
  isPolymorphic(): boolean;
  klass: typeof Base;
  throughReflection: FixtureReflection & { tableName: string };
}

export class ReflectionProxy {
  protected _association: FixtureReflection;

  constructor(association: FixtureReflection) {
    this._association = association;
  }

  get joinTable(): string {
    return this._association.joinTable!;
  }

  get name(): string {
    return this._association.name;
  }

  get primaryKeyType(): string {
    const klass = this._association.klass;
    return `:${klass.typeForAttribute(String(klass.primaryKey))?.type()}`;
  }
}

export class HasManyThroughProxy extends ReflectionProxy {
  get rhsKey(): string | string[] {
    return this._association.foreignKey;
  }

  get lhsKey(): string | string[] {
    return this._association.throughReflection.foreignKey;
  }

  override get joinTable(): string {
    return this._association.throughReflection.tableName;
  }

  get timestampColumnNames(): string[] {
    return allTimestampAttributesInModel.call(this._association.throughReflection.klass as never);
  }
}

export class PrimaryKeyError extends Error {
  constructor(label: string, association: FixtureReflection, value: unknown) {
    super(
      `Unable to set ${association.name} to ${String(value)} because the association has a\n` +
        `custom primary key (${String(association.joinPrimaryKey())}) that does not match the\n` +
        `associated table's primary key (${String(association.klass.primaryKey)}).\n\n` +
        `To fix this, change your fixture from\n\n` +
        `${label}:\n  ${association.name}: ${String(value)}\n\n` +
        `to\n\n` +
        `${label}:\n  ${String(association.foreignKey)}: **value**\n\n` +
        `where **value** is the ${String(association.joinPrimaryKey())} value for the\n` +
        `associated ${association.klass.name} record.\n`,
    );
    this.name = "ActiveRecord::FixtureSet::TableRow::PrimaryKeyError";
  }
}

export class TableRow {
  private _tableRows: TableRows;
  private _label: string;
  private _now: unknown;
  private _row: Record<string, unknown>;
  private _reflectionClass?: typeof Base;

  constructor(
    fixture: Fixture,
    { tableRows, label, now }: { tableRows: TableRows; label: string; now: unknown },
  ) {
    this._tableRows = tableRows;
    this._label = label;
    this._now = now;
    this._row = fixture.toHash();
    this.fillRowModelAttributes();
  }

  toHash(): Record<string, unknown> {
    return this._row;
  }

  private get modelMetadata(): ModelMetadata {
    return this._tableRows.modelMetadata;
  }

  private get modelClass(): typeof Base | null {
    return this._tableRows.modelClass;
  }

  private fillRowModelAttributes(): void {
    if (!this.modelClass) return;
    this.fillTimestamps();
    this.interpolateLabel();
    if (this.modelClass.compositePrimaryKey) {
      this.generateCompositePrimaryKey();
    } else {
      this.generatePrimaryKey();
    }
    this.resolveEnums();
    this.resolveStiReflections();
  }

  /** @missingRailsCall include? — PERMANENT */
  private get reflectionClass(): typeof Base {
    return (this._reflectionClass ??= (() => {
      const inheritanceColumnName = this.modelMetadata.inheritanceColumnName;
      if (inheritanceColumnName != null && hasKey(this._row, inheritanceColumnName)) {
        try {
          return findStiClass(this.modelClass!, String(this._row[inheritanceColumnName]));
        } catch {
          return this.modelClass!;
        }
      } else {
        return this.modelClass!;
      }
    })());
  }

  private fillTimestamps(): void {
    if (this.modelClass!.recordTimestamps) {
      for (const cName of this.modelMetadata.timestampColumnNames) {
        if (!hasKey(this._row, cName)) this._row[cName] = this._now;
      }
    }
  }

  private interpolateLabel(): void {
    for (const [key, value] of Object.entries(this._row)) {
      if (typeof value === "string") this._row[key] = value.replaceAll("$LABEL", this._label);
    }
  }

  private generatePrimaryKey(): void {
    const pk = this.modelMetadata.primaryKeyName as string;

    if (!this.isColumnDefined(pk)) {
      this._row[pk] = FixtureSet.identify(this._label, this.modelMetadata.columnType(pk)!);
    }
  }

  private generateCompositePrimaryKey(): void {
    const compositeKey = FixtureSet.compositeIdentify(
      this._label,
      this.modelMetadata.primaryKeyName as string[],
    );
    for (const [column, value] of Object.entries(compositeKey)) {
      if (this.isColumnDefined(column)) continue;

      this._row[column] = value;
    }
  }

  /** @missingRailsCall include? — PERMANENT */
  private isColumnDefined(col: string): boolean {
    return !this.modelMetadata.hasColumn(col) || hasKey(this._row, col);
  }

  /** @missingRailsCall include? — PERMANENT */
  private resolveEnums(): void {
    const definedEnums = (
      this.reflectionClass as {
        _enums?: Map<string, Record<string, number | string | boolean | null>>;
      }
    )._enums;
    for (const [name, values] of definedEnums ?? []) {
      if (hasKey(this._row, name)) {
        const value = this._row[name];
        this._row[name] =
          typeof value === "string" && Object.hasOwn(values, value) ? values[value] : value;
      }
    }
  }

  /** @missingRailsCall delete — PERMANENT */
  private resolveStiReflections(): void {
    const reflections = (this.reflectionClass as { _reflections?: Record<string, unknown> })
      ._reflections;
    for (const association of Object.values(reflections ?? {}) as FixtureReflection[]) {
      switch (association.macro) {
        case "belongsTo": {
          const fkName = association.joinForeignKey;

          let value: unknown;
          if (association.name !== fkName) {
            value = this._row[association.name];
            delete this._row[association.name];
          }
          if (association.name !== fkName && value != null && value !== false) {
            if (association.isPolymorphic()) {
              const match = typeof value === "string" ? /\s*\(([^)]*)\)\s*$/.exec(value) : null;
              if (match) {
                value = (value as string).slice(0, match.index);
                this._row[association.joinForeignType!] = match[1];
              }
            } else if (
              JSON.stringify(association.joinPrimaryKey()) !==
              JSON.stringify(association.klass.primaryKey)
            ) {
              throw new PrimaryKeyError(this._label, association, value);
            }

            if (Array.isArray(fkName)) {
              const compositeKey = FixtureSet.compositeIdentify(String(value), fkName);
              for (const [column, value] of Object.entries(compositeKey)) {
                if (this.isColumnDefined(column)) continue;

                this._row[column] = value;
              }
            } else {
              const fkType = `:${this.reflectionClass.typeForAttribute(fkName)?.type()}`;
              this._row[fkName] = FixtureSet.identify(String(value), fkType);
            }
          }
          break;
        }
        case "hasMany":
          if (association.options.through) {
            this.addJoinRecords(new HasManyThroughProxy(association));
          }
          break;
      }
    }
  }

  /** @missingRailsCall delete — PERMANENT */
  private addJoinRecords(association: HasManyThroughProxy): void {
    let targets = this._row[association.name];
    delete this._row[association.name];
    if (targets != null && targets !== false) {
      const tableName = association.joinTable;
      const columnType = association.primaryKeyType;
      const lhsKey = association.lhsKey as string;
      const rhsKey = association.rhsKey as string;

      targets = Array.isArray(targets) ? targets : String(targets).split(/\s*,\s*/);
      const joins = (targets as unknown[]).map((target) => {
        const join: Record<string, unknown> = {
          [lhsKey]: this._row[this.modelMetadata.primaryKeyName as string],
          [rhsKey]: FixtureSet.identify(String(target), columnType),
        };
        for (const col of association.timestampColumnNames) {
          join[col] = this._now;
        }
        return join;
      });
      const tables = this._tableRows.tables;
      if (!tables.get(tableName)) tables.set(tableName, []);
      tables.get(tableName)!.push(...joins);
    }
  }
}
