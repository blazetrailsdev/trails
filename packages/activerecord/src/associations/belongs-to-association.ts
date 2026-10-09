import { fetch, rbEqual, rbFCaller, rbFPublicSend } from "@blazetrails/ruby-compat";
import { ActiveRecord, Associations } from "../namespaces.js";
import type { Base } from "../base.js";
import { kernelArray, underscore } from "@blazetrails/activesupport";
import { SingularAssociation } from "./singular-association.js";
import { Rollback } from "../errors.js";

export class BelongsToAssociation extends SingularAssociation {
  private _updated = false;

  async handleDependency(): Promise<void> {
    if (!(await this.loadTarget())) return;

    switch (this.options.dependent) {
      case "destroy":
        if (!(await this.target!.destroy())) throw new Rollback();
        break;
      case "destroyAsync": {
        let primaryKeyColumn: string | string[];
        let id: unknown;
        const foreignKey = this.reflection.foreignKey();
        if (Array.isArray(foreignKey)) {
          primaryKeyColumn = this.reflection.activeRecordPrimaryKey;
          id = foreignKey.map((col) => (this.owner as any)[col]);
        } else {
          primaryKeyColumn = this.reflection.activeRecordPrimaryKey;
          id = (this.owner as any)[foreignKey];
        }

        const associationClass = this.reflection.isPolymorphic()
          ? (this.owner as any)[this.reflection.foreignType!]
          : this.reflection.klass.name;

        this.enqueueDestroyAssociation({
          ownerModelName: this.owner.constructor.name,
          ownerId: this.owner.id,
          associationClass: String(associationClass),
          associationIds: [id],
          associationPrimaryKeyColumn: primaryKeyColumn,
          ensuringOwnerWasMethod: fetch(
            this.options as Record<string, unknown>,
            "ensuringOwnerWas",
            null,
          ),
        });
        break;
      }
      default:
        await rbFPublicSend(this.target, this.options.dependent);
    }
  }

  override inversedFrom(record: Base | null): void {
    this.replaceKeys(record);
    super.inversedFrom(record);
  }

  /** @missingRailsName instanceExec — PERMANENT */
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
    if (this.reflection.isPolymorphic()) {
      const modelTypeWas = this.owner.attributeBeforeLastSave(this.reflection.foreignType!);
      if (modelTypeWas != null) {
        modelWas = (this.owner.constructor as typeof Base).polymorphicClassFor(
          modelTypeWas as string,
        );
      }
    } else {
      modelWas = this.klass;
    }

    const foreignKeyWas = this.owner.attributeBeforeLastSave(
      this.reflection.foreignKey() as string,
    );

    if (foreignKeyWas != null && modelWas.prototype instanceof ActiveRecord.Base) {
      await this.updateCountersViaScope(modelWas, foreignKeyWas, -1);
    }
  }

  private async updateCountersViaScope(klass: any, foreignKey: unknown, by: number): Promise<void> {
    const scope = klass.unscoped().whereBang(new Map([[this.primaryKey(klass), foreignKey]]));
    await scope.updateCounters({
      [this.reflection.counterCacheColumn()!]: by,
      touch: (this.reflection.options as any).touch,
    });
  }

  isTargetChanged(): boolean | undefined {
    const changed = this.foreignKeyNames().some((foreignKey) =>
      this.owner.attributeChanged(foreignKey),
    );
    return changed || (!this.foreignKeyPresent() && this.target?.isNewRecord());
  }

  isTargetPreviouslyChanged(): boolean | undefined {
    return this.foreignKeyNames().some((foreignKey) =>
      this.owner.attributePreviouslyChanged(foreignKey),
    );
  }

  isSavedChangeToTarget(): boolean {
    return this.foreignKeyNames().some((foreignKey) =>
      this.owner.isSavedChangeToAttribute(foreignKey),
    );
  }

  protected override replace(record: Base | null): Base | null {
    if (record) {
      this.raiseOnTypeMismatchBang(record);
      this.setInverseInstance(record);
      this._updated = true;
    } else if (this.target) {
      this.removeInverseInstance(this.target);
    }

    this.replaceKeys(record, { force: true });

    return (this.target = record);
  }

  protected override staleState(): unknown {
    const owner = this.owner as unknown as {
      _readAttribute(n: string, block: (n: string) => unknown): unknown;
      missingAttribute(n: string, stack: string[]): never;
    };
    return owner._readAttribute(this.reflection.foreignKey() as string, (n) =>
      owner.missingAttribute(n, rbFCaller()),
    );
  }

  /** @internal */
  override isFindTarget(): boolean {
    return !this.isLoaded() && this.foreignKeyPresent() && !!this.klass;
  }

  /** @internal */
  protected override isInvertibleFor(record: Base): boolean {
    const inverse = this.inverseReflectionFor(record);
    return inverse != null && (inverse.isHasOne() || inverse.klass.hasManyInversing);
  }

  protected override foreignKeyPresent(): boolean {
    return kernelArray(this.reflection.foreignKey()).every(
      (fk) => this.owner._readAttribute(fk) != null,
    );
  }

  private foreignKeyName(): string {
    const fk = this.reflection.foreignKey() ?? `${underscore(this.reflection.name)}_id`;
    return Array.isArray(fk) ? fk[0] : fk;
  }

  protected foreignKeyNames(): string[] {
    const fk = this.reflection.foreignKey() ?? `${underscore(this.reflection.name)}_id`;
    return Array.isArray(fk) ? fk : [fk];
  }

  /** @internal */
  protected primaryKey(klass: typeof Base): string | string[] {
    return this.reflection.associationPrimaryKey(klass);
  }

  /** @missingRailsName class — PERMANENT */
  protected replaceKeys(record: Base | null, { force = false }: { force?: boolean } = {}): void {
    const reflectionFk = this.reflection.foreignKey();
    if (Array.isArray(reflectionFk)) {
      const targetKeyValues = record
        ? kernelArray(this.primaryKey(record.constructor as typeof Base)).map((key) =>
            record._readAttribute(key),
          )
        : [];

      if (
        force ||
        !rbEqual(
          reflectionFk.map((fk) => this.owner._readAttribute(fk)),
          targetKeyValues,
        )
      ) {
        reflectionFk.forEach((key, index) => {
          this.owner.set(key, targetKeyValues[index]);
        });
      }
    } else {
      const targetKeyValue = record
        ? record._readAttribute(this.primaryKey(record.constructor as typeof Base) as string)
        : null;

      if (force || !rbEqual(this.owner._readAttribute(reflectionFk), targetKeyValue)) {
        this.owner.set(reflectionFk, targetKeyValue);
      }
    }
  }

  private requireCounterUpdate(): boolean {
    return this.reflection.counterCacheColumn() != null && this.owner.isPersisted();
  }

  private async updateCounters(by: number): Promise<void> {
    if (this.requireCounterUpdate() && this.foreignKeyPresent()) {
      if (this.target && !this.isStaleTarget()) {
        await this.target.incrementBang(this.reflection.counterCacheColumn()!, by, {
          touch: this.reflection.options.touch,
        });
      } else {
        await this.updateCountersViaScope(
          this.klass,
          this.owner._readAttribute(this.reflection.foreignKey() as string),
          by,
        );
      }
    }
  }
}

Associations.BelongsToAssociation = BelongsToAssociation;
