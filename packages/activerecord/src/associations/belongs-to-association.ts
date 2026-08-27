import type { Base } from "../base.js";
import type { AssociationDefinition } from "../associations.js";
import { underscore } from "@blazetrails/activesupport";
import { belongsToCounterCacheColumn } from "../reflection.js";
import { hasQueryConstraints, queryConstraintsList } from "../persistence.js";
import { SingularAssociation } from "./singular-association.js";
import { Rollback } from "../errors.js";
import { MissingAttributeError } from "@blazetrails/activemodel";

export class BelongsToAssociation extends SingularAssociation {
  private _updated = false;

  constructor(owner: Base, definition: AssociationDefinition) {
    super(owner, definition);
  }

  /** @missingRailsCall fetch — PERMANENT */
  async handleDependency(): Promise<void> {
    const target = await this.loadTarget();
    if (!target) return;

    const dependent = this.reflection.options.dependent;
    if (!dependent) return;

    switch (dependent) {
      case "destroy":
        if (typeof (target as any).destroy === "function") {
          if ((await (target as any).destroy()) === false) {
            throw new Rollback();
          }
        }
        break;
      case "destroyAsync": {
        let primaryKeyColumn: string | string[];
        let id: unknown;
        if (Array.isArray(this.reflection.foreignKey)) {
          primaryKeyColumn = (this.reflection as any).activeRecordPrimaryKey;
          id = this.reflection.foreignKey.map((col) => (this.owner as any)[col]);
        } else {
          primaryKeyColumn = (this.reflection as any).activeRecordPrimaryKey;
          id = (this.owner as any)[this.reflection.foreignKey as string];
        }

        const associationClass = (this.reflection as any).isPolymorphic()
          ? (this.owner as any)[(this.reflection as any).foreignType as string]
          : this.reflection.klass;

        this.enqueueDestroyAssociation({
          ownerModelName: this.owner.constructor.name,
          ownerId: (this.owner as any).id,
          associationClass: String(
            typeof associationClass === "function" ? associationClass.name : associationClass,
          ),
          associationIds: [id],
          associationPrimaryKeyColumn: primaryKeyColumn,
          ensuringOwnerWasMethod:
            "ensuringOwnerWas" in this.reflection.options
              ? (this.reflection.options as any).ensuringOwnerWas
              : null,
        });
        break;
      }
      case "delete":
        if (typeof (target as any).delete === "function") {
          await (target as any).delete();
        }
        break;
    }
  }

  override inversedFrom(record: Base | null): void {
    if (record) this.target = record;
    this.replaceKeys(record);
    super.inversedFrom(record);
  }

  async default(block: (owner: Base) => Base | null | Promise<Base | null>): Promise<void> {
    if ((await this.reader) == null) await this.writer(await block(this.owner));
  }

  override reset(): void {
    super.reset();
    this._updated = false;
  }

  isUpdated(): boolean {
    return this._updated;
  }

  async decrementCounters(): Promise<void> {
    await this.updateCounters(-1);
  }

  async incrementCounters(): Promise<void> {
    await this.updateCounters(1);
  }

  async decrementCountersBeforeLastSave(): Promise<void> {
    let modelWas: any;
    if (this.reflection.options.polymorphic) {
      const foreignType =
        (this.reflection as any).foreignType ??
        (this.reflection.options as any).foreignType ??
        `${underscore(this.reflection.name)}_type`;
      const modelTypeWas =
        typeof this.owner.attributeBeforeLastSave === "function"
          ? this.owner.attributeBeforeLastSave(foreignType)
          : undefined;
      if (modelTypeWas) {
        try {
          modelWas = (this.owner.constructor as typeof Base).polymorphicClassFor(
            modelTypeWas as string,
          );
        } catch {
          return;
        }
      }
    } else {
      modelWas = this.klass;
    }

    const fkNames = this.foreignKeyNames();
    const foreignKeyWas = fkNames.map((foreignKey) =>
      typeof this.owner.attributeBeforeLastSave === "function"
        ? this.owner.attributeBeforeLastSave(foreignKey)
        : undefined,
    );

    if (foreignKeyWas.some((v) => v != null) && modelWas) {
      const counterCol = this.counterCacheColumn();
      if (!counterCol) return;
      await this.updateCountersViaScope(modelWas, foreignKeyWas, -1);
    }
  }

  private async updateCountersViaScope(
    klass: any,
    foreignKeyValues: any[],
    by: number,
  ): Promise<void> {
    const counterCol = this.counterCacheColumn();
    if (!counterCol) return;
    if (typeof klass.unscoped !== "function") return;

    const pks = this.associationPrimaryKeys(klass);
    if (pks.length !== foreignKeyValues.length) return;
    const conditions: Record<string, unknown> = {};
    for (let i = 0; i < pks.length; i++) {
      if (foreignKeyValues[i] == null) return;
      conditions[pks[i]] = foreignKeyValues[i];
    }

    const scope = klass.unscoped().whereBang(conditions);
    if (typeof scope.updateCounters === "function") {
      const touch = (this.reflection.options as any).touch;
      await scope.updateCounters({ [counterCol]: by, touch });
    }
  }

  isTargetChanged(): boolean {
    const changed = this.foreignKeyNames().some((foreignKey) =>
      this.owner.attributeChanged(foreignKey),
    );
    return (
      changed || (!this.foreignKeyPresent() && this.target != null && this.target.isNewRecord())
    );
  }

  isTargetPreviouslyChanged(): boolean {
    return this.foreignKeyNames().some((foreignKey) =>
      this.owner.attributePreviouslyChanged(foreignKey),
    );
  }

  isSavedChangeToTarget(): boolean {
    return this.foreignKeyNames().some((foreignKey) =>
      this.owner.isSavedChangeToAttribute(foreignKey),
    );
  }

  protected override replace(record: Base | null): void {
    if (record) {
      this.raiseOnTypeMismatchBang(record);
      this.setInverseInstance(record);
      this._updated = true;
    } else if (this.target) {
      this.removeInverseInstance(this.target);
    }

    this.replaceKeys(record, { force: true });
    this.target = record;
  }

  protected override staleState(): unknown {
    const fks = this.foreignKeyNames();
    if (fks.length !== 1) return null;
    return typeof (this.owner as any)._readAttribute === "function"
      ? (this.owner as any)._readAttribute(fks[0], (n: string) => {
          throw new MissingAttributeError(
            `missing attribute '${n}' for ${(this.owner.constructor as { name?: string }).name ?? "unknown"}`,
          );
        })
      : (this.owner as any)[fks[0]];
  }

  protected override findTargetNeeded(): boolean {
    return !this.isLoaded() && this.foreignKeyPresent() && !!this.klass;
  }

  /** @internal */
  protected override isInvertibleFor(record: Base): boolean {
    const inverse = this.inverseReflectionOn(record);
    if (!inverse) return false;
    const isHasOne =
      typeof inverse.isHasOne === "function" ? inverse.isHasOne() : inverse.macro === "hasOne";
    const inverseKlass = inverse.klass;
    return isHasOne || !!inverseKlass?.hasManyInversing;
  }

  /** @internal */
  private inverseReflectionOn(
    record: Base,
  ): { macro?: string; isHasOne?: () => boolean; klass?: typeof Base } | null {
    if ((this.reflection.options as { polymorphic?: boolean }).polymorphic) {
      return (
        (this.inverseReflectionFor(record) as {
          macro?: string;
          isHasOne?: () => boolean;
          klass?: typeof Base;
        }) ?? null
      );
    }
    const inverseName =
      this.reflection.inverseName?.() ??
      (this.reflection.options.inverseOf as string | undefined) ??
      null;
    if (!inverseName) return null;
    const recordCtor = record.constructor as {
      _reflectOnAssociation?: (
        n: string,
      ) => { macro?: string; isHasOne?: () => boolean; klass?: typeof Base } | null;
    };
    return recordCtor._reflectOnAssociation?.(inverseName) ?? null;
  }

  protected override foreignKeyPresent(): boolean {
    return this.foreignKeyNames().every((fk) => {
      const value =
        typeof (this.owner as any)._readAttribute === "function"
          ? (this.owner as any)._readAttribute(fk)
          : (this.owner as any)[fk];
      return value != null;
    });
  }

  private foreignKeyName(): string {
    const fk = this.reflection.foreignKey ?? `${underscore(this.reflection.name)}_id`;
    return Array.isArray(fk) ? fk[0] : fk;
  }

  protected foreignKeyNames(): string[] {
    const fk = this.reflection.foreignKey ?? `${underscore(this.reflection.name)}_id`;
    return Array.isArray(fk) ? fk : [fk];
  }

  protected associationPrimaryKeys(klass: typeof Base | null): string[] {
    const configured = this.reflection.options.primaryKey;
    if (configured) {
      return Array.isArray(configured) ? configured : [configured];
    }
    const targetCtor = (klass ?? this.klass) as never;
    if (
      targetCtor &&
      (hasQueryConstraints.call(targetCtor) || this.reflection.options.queryConstraints)
    ) {
      const qc = queryConstraintsList.call(targetCtor);
      if (qc) return qc;
    }
    const pk = ((klass ?? this.klass) as any)?.primaryKey;
    if (pk) return inferCompositePrimaryKey(pk);
    return ["id"];
  }

  protected replaceKeys(record: Base | null, { force = false }: { force?: boolean } = {}): void {
    const fks = this.foreignKeyNames();
    const pks = this.associationPrimaryKeys((record?.constructor as typeof Base) ?? null);

    const targetKeyValues = fks.map((_fk, i) => {
      const pkCol = pks[i] ?? pks[0];
      return record
        ? typeof (record as any)._readAttribute === "function"
          ? (record as any)._readAttribute(pkCol)
          : (record as any)[pkCol]
        : null;
    });

    const readOwner = (fk: string): unknown =>
      typeof (this.owner as any)._readAttribute === "function"
        ? (this.owner as any)._readAttribute(fk)
        : (this.owner as any)[fk];
    if (!force && fks.every((fk, i) => readOwner(fk) === targetKeyValues[i])) return;

    for (let i = 0; i < fks.length; i++) {
      const value = targetKeyValues[i];
      if (typeof (this.owner as any)._writeAttribute === "function") {
        (this.owner as any)._writeAttribute(fks[i], value);
      } else {
        (this.owner as any)[fks[i]] = value;
      }
    }
  }

  private counterCacheColumn(): string | null {
    const fromReflection = this.reflection.counterCacheColumn?.();
    if (fromReflection !== undefined && fromReflection !== null) return fromReflection;
    return belongsToCounterCacheColumn(
      this.reflection.options.counterCache,
      this.owner.constructor.name,
    );
  }

  private requireCounterUpdate(): boolean {
    return this.counterCacheColumn() != null && this.owner.isPersisted();
  }

  private async updateCounters(by: number): Promise<void> {
    if (this.requireCounterUpdate() && this.foreignKeyPresent()) {
      const target = this.target as any;
      if (target && !this.isStaleTarget() && typeof target.incrementBang === "function") {
        const counterCol = this.counterCacheColumn()!;
        const touch = (this.reflection.options as any).touch;
        await target.incrementBang(counterCol, by, touch != null ? { touch } : {});
      } else {
        await this.updateCountersViaScope(
          this.klass,
          this.foreignKeyNames().map((fk) => (this.owner as any)._readAttribute?.(fk)),
          by,
        );
      }
    }
  }
}

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE
 */
export function inferCompositePrimaryKey(pk: string | string[]): string[] {
  if (Array.isArray(pk)) return pk.includes("id") ? ["id"] : pk;
  return [pk];
}
