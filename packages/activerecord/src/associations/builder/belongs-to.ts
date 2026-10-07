import {
  first,
  type Hash,
  hashDelete,
  hasKey,
  type Module,
  rbObjRespondTo,
  rtest,
  union,
} from "@blazetrails/ruby-compat";
import { safeConstantize } from "@blazetrails/activesupport";
import type { AssociationInstanceHost } from "./association.js";
import { SingularAssociation } from "./singular-association.js";
import { pendingCounterCacheColumns } from "../../counter-cache-state.js";
import { belongsToRequiredValidatesForeignKey } from "../../active-record.js";

export class BelongsTo extends SingularAssociation {
  static override macro(): string {
    return "belongsTo";
  }

  static override validOptions(options: Record<string, unknown>): string[] {
    const valid = [
      ...super.validOptions(options),
      "polymorphic",
      "counterCache",
      "optional",
      "default",
      "touch",
    ];
    if (options.polymorphic) valid.push("foreignType");
    if (options.dependent === "destroyAsync") valid.push("ensuringOwnerWas");
    return valid;
  }

  static override validDependentOptions(): string[] {
    return ["destroy", "delete", "destroyAsync"];
  }

  static override defineCallbacks(model: any, reflection: any): void {
    super.defineCallbacks(model, reflection);
    if (reflection.options.counterCache) this.addCounterCacheCallbacks(model, reflection);
    if (reflection.options.touch) this.addTouchCallbacks(model, reflection);
    if (reflection.options.default) this.addDefaultCallbacks(model, reflection);
  }

  /** @inventedArm if — CONVERGEABLE eliminate-pending-counter-cache-deferral-via-lazy-target-resolution */
  static addCounterCacheCallbacks(model: any, reflection: any): void {
    const cacheColumn = reflection.counterCacheColumn();

    model.afterUpdate(async (record: any) => {
      const association = record.association(reflection.name);

      if (association.isSavedChangeToTarget()) {
        await association.incrementCounters();
        await association.decrementCountersBeforeLastSave();
      }
    });

    const klass = safeConstantize(reflection.className) as any;
    if (klass && rbObjRespondTo(klass, "_counterCacheColumns")) {
      klass._counterCacheColumns = union(klass._counterCacheColumns, [cacheColumn]);
    }
    if (!klass) {
      const pending =
        pendingCounterCacheColumns.get(reflection.className) ?? new Set<() => string>();
      pending.add(() => cacheColumn);
      pendingCounterCacheColumns.set(reflection.className, pending);
    }
    model.counterCachedAssociationNames = union(model.counterCachedAssociationNames, [
      reflection.name,
    ]);
  }

  static async touchRecord(
    o: any,
    changes: Hash<string | string[], unknown[]>,
    foreignKey: string | string[],
    name: string,
    touch: any,
  ): Promise<void> {
    const oldForeignId = changes.get(foreignKey) && first(changes.get(foreignKey)!);

    if (rtest(oldForeignId)) {
      const association = o.association(name);
      const reflection = association.reflection;
      let klass: any;
      if (reflection.isPolymorphic()) {
        const foreignType = reflection.foreignType;
        klass = (changes.get(foreignType) && first(changes.get(foreignType)!)) || o[foreignType];
        klass = o.constructor.polymorphicClassFor(klass);
      } else {
        klass = association.klass;
      }
      const primaryKey = reflection.associationPrimaryKey(klass);
      const oldRecord = await klass.findBy({ [primaryKey]: oldForeignId });

      if (oldRecord) {
        if (touch !== true) {
          await oldRecord.touchLater(touch);
        } else {
          await oldRecord.touchLater();
        }
      }
    }

    const record = await o[name];
    if (record && record.isPersisted()) {
      if (touch !== true) {
        await record.touchLater(touch);
      } else {
        await record.touchLater();
      }
    }
  }

  static addTouchCallbacks(model: any, reflection: any): void {
    const foreignKey = reflection.foreignKey();
    const name = reflection.name;
    const touch = reflection.options.touch;

    const callback = (changesMethod: string) => (record: any) =>
      BelongsTo.touchRecord(record, record[changesMethod], foreignKey, name, touch);

    if (reflection.counterCacheColumn()) {
      const touchCallback = callback("savedChanges");
      const updateCallback = async (record: any) => {
        if (!record.association(reflection.name).isSavedChangeToTarget()) {
          await touchCallback(record);
        }
      };
      model.afterUpdate(updateCallback, { if: ":isSavedChanges" });
    } else {
      model.afterCreate(callback("savedChanges"), { if: ":isSavedChanges" });
      model.afterUpdate(callback("savedChanges"), { if: ":isSavedChanges" });
      model.afterDestroy(callback("changesToSave"));
    }

    model.afterTouch(callback("changesToSave"));
  }

  static addDefaultCallbacks(model: any, reflection: any): void {
    model.beforeValidation((o: any) =>
      o.association(reflection.name).default(reflection.options.default),
    );
  }

  static override addDestroyCallbacks(model: any, reflection: any): void {
    model.afterDestroy((o: any) => o.association(reflection.name).handleDependency());
  }

  static override defineValidations(model: any, reflection: any): void {
    if (hasKey(reflection.options, "required")) {
      reflection.options.optional = !hashDelete(reflection.options, "required");
    }

    let required: boolean;
    if (reflection.options.optional == null) {
      required = model.belongsToRequiredByDefault;
    } else {
      required = !reflection.options.optional;
    }

    super.defineValidations(model, reflection);

    if (required) {
      if (belongsToRequiredValidatesForeignKey()) {
        model.validatesPresenceOf(reflection.name, { message: ":required" });
      } else {
        const condition = (record: any) => {
          const foreignKey = reflection.foreignKey();
          const foreignType = reflection.foreignType;

          return (
            record.readAttribute(foreignKey) == null ||
            record.attributeChanged(foreignKey) ||
            (reflection.isPolymorphic() &&
              (record.readAttribute(foreignType) == null || record.attributeChanged(foreignType)))
          );
        };

        model.validatesPresenceOf(reflection.name, { message: ":required", if: condition });
      }
    }
  }

  static override defineChangeTrackingMethods(model: any, reflection: any): void {
    const mixin: Module = model.generatedAssociationMethods();
    const name = reflection.name;

    mixin.defineMethod(`${name}Changed`, function (this: AssociationInstanceHost) {
      return this.association(name).isTargetChanged();
    });
    mixin.defineMethod(`${name}PreviouslyChanged`, function (this: AssociationInstanceHost) {
      return this.association(name).isTargetPreviouslyChanged();
    });
  }
}
