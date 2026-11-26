import { type Hash, hashDelete } from "@blazetrails/ruby-compat/hash";
import type { Module } from "@blazetrails/ruby-compat/include";
import { rbObjRespondTo, rtest } from "@blazetrails/ruby-compat/object";
import { union } from "@blazetrails/ruby-compat/array";
import { safeConstantize } from "@blazetrails/activesupport";
import type { AssociationInstanceHost } from "./association.js";
import { SingularAssociation } from "./singular-association.js";
import { belongsToRequiredValidatesForeignKey } from "../../active-record.js";
import { Builder } from "../../namespaces.js";
import type { Base } from "../../base.js";
import type { AssociationReflection } from "../../reflection.js";
import type { BelongsToAssociation } from "../belongs-to-association.js";

export class BelongsTo extends SingularAssociation {
  static override macro(): "belongsTo" {
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

  static override defineCallbacks(model: typeof Base, reflection: AssociationReflection): void {
    super.defineCallbacks(model, reflection);
    if (reflection.options.counterCache) this.addCounterCacheCallbacks(model, reflection);
    if (reflection.options.touch) this.addTouchCallbacks(model, reflection);
    if (reflection.options.default) this.addDefaultCallbacks(model, reflection);
  }

  static addCounterCacheCallbacks(model: typeof Base, reflection: AssociationReflection): void {
    const cacheColumn = reflection.counterCacheColumn();

    model.afterUpdate(async (record: Base) => {
      const association = record.association(reflection.name) as BelongsToAssociation;

      if (association.isSavedChangeToTarget()) {
        await association.incrementCounters();
        await association.decrementCountersBeforeLastSave();
      }
    });

    const klass = safeConstantize(reflection.className) as any;
    if (klass && rbObjRespondTo(klass, "_counterCacheColumns")) {
      klass._counterCacheColumns = union(klass._counterCacheColumns, [cacheColumn]);
    }
    model.counterCachedAssociationNames = [
      ...new Set([...model.counterCachedAssociationNames, reflection.name]),
    ];
  }

  static async touchRecord(
    o: any,
    changes: Hash<string | string[], unknown[]>,
    foreignKey: string | string[],
    name: string,
    touch: any,
  ): Promise<void> {
    const oldForeignId = changes.get(foreignKey) && (changes.get(foreignKey)![0] ?? null);

    if (rtest(oldForeignId)) {
      const association = o.association(name);
      const reflection = association.reflection;
      let klass: any;
      if (reflection.isPolymorphic()) {
        const foreignType = reflection.foreignType;
        klass =
          (changes.get(foreignType) && (changes.get(foreignType)![0] ?? null)) || o[foreignType];
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

  static addTouchCallbacks(model: typeof Base, reflection: AssociationReflection): void {
    const foreignKey = reflection.foreignKey();
    const name = reflection.name;
    const touch = reflection.options.touch;

    const callback = (changesMethod: "savedChanges" | "changesToSave") => (record: any) =>
      BelongsTo.touchRecord(record, record[changesMethod], foreignKey, name, touch);

    if (reflection.counterCacheColumn()) {
      const touchCallback = callback("savedChanges");
      const updateCallback = async (record: Base) => {
        if (
          !(record.association(reflection.name) as BelongsToAssociation).isSavedChangeToTarget()
        ) {
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

  static addDefaultCallbacks(model: typeof Base, reflection: AssociationReflection): void {
    model.beforeValidation((o: Base) =>
      (o.association(reflection.name) as BelongsToAssociation).default(
        reflection.options.default as Parameters<BelongsToAssociation["default"]>[0],
      ),
    );
  }

  static override addDestroyCallbacks(model: typeof Base, reflection: AssociationReflection): void {
    model.afterDestroy((o: Base) =>
      (o.association(reflection.name) as BelongsToAssociation).handleDependency(),
    );
  }

  static override defineValidations(model: typeof Base, reflection: AssociationReflection): void {
    if ("required" in reflection.options) {
      reflection.options.optional = !hashDelete(reflection.options, "required");
    }

    let required: boolean | null | undefined;
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

  static override defineChangeTrackingMethods(
    model: typeof Base,
    reflection: AssociationReflection,
  ): void {
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

Builder.BelongsTo = BelongsTo;
