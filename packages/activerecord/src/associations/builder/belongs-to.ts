import { underscore } from "@blazetrails/activesupport";
import { SingularAssociation } from "./singular-association.js";
import { beforeValidation, afterCreate, afterUpdate, afterDestroy } from "../../callbacks.js";
import { resolveModel } from "../../associations.js";

/**
 * Mirrors: ActiveRecord::Associations::Builder::BelongsTo
 */
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
    ];
    if (options.polymorphic) valid.push("foreignType");
    if (options.dependent === "destroyAsync") valid.push("ensuringOwnerWas");
    return valid;
  }

  static override validDependentOptions(): string[] {
    return ["destroy", "delete", "destroyAsync"];
  }

  static override defineCallbacks(model: any, reflection: any): void {
    const options = reflection.options ?? {};
    const dependent = options.dependent;
    if (dependent) {
      this.addDestroyCallbacks(model, reflection);
      this.addAfterCommitJobsCallback(model, dependent as string);
    }
    for (const extension of this.extensions) {
      if (typeof extension.build === "function") {
        extension.build(model, reflection);
      }
    }
    if (options.counterCache) {
      this.addCounterCacheCallbacks(model, reflection);
    }
    if (options.touch) {
      this.addTouchCallbacks(model, reflection);
    }
    if (options.default != null) {
      this.addDefaultCallbacks(model, reflection);
    }
  }

  static addCounterCacheCallbacks(_model: any, _reflection: any): void {
    // Counter cache is handled by updateCounterCaches() in associations.ts,
    // called from Base#_createOrUpdate and Base#_destroyRow. Migrating to
    // per-association afterCreate/afterUpdate callbacks is tracked as a
    // follow-up to avoid double-counting with the centralized handler.
  }

  private static resolvePk(reflection: any, klass: any): string | string[] {
    const configuredPk = reflection?.options?.primaryKey;
    if (configuredPk != null) return configuredPk;
    const apk = reflection?.associationPrimaryKey;
    if (typeof apk === "function") return apk.call(reflection, klass);
    if (apk != null) return apk;
    return klass?.primaryKey ?? "id";
  }

  private static async touchParent(target: any, touch: any): Promise<void> {
    if (Array.isArray(touch) && touch.length === 0) return;
    const touchFn = target.touchLater ?? target.touch;
    if (typeof touchFn !== "function") return;
    if (touch === true) {
      await touchFn.call(target);
    } else if (Array.isArray(touch)) {
      await touchFn.call(target, ...touch);
    } else {
      await touchFn.call(target, touch);
    }
  }

  private static buildFindConditions(
    pk: string | string[],
    fkValue: any,
  ): Record<string, any> | null {
    if (Array.isArray(pk)) {
      const values = Array.isArray(fkValue) ? fkValue : [fkValue];
      if (pk.length !== values.length) return null;
      if (values.some((v) => v == null)) return null;
      return Object.fromEntries(pk.map((key, i) => [key, values[i]]));
    }
    if (fkValue == null) return null;
    return { [pk]: fkValue };
  }

  static async touchRecord(
    record: any,
    changes: Record<string, any>,
    foreignKey: string | string[],
    name: string,
    touch: any,
  ): Promise<void> {
    const fkColumns = Array.isArray(foreignKey) ? foreignKey : [foreignKey];

    // Fill missing old FK parts from current attributes for composite keys —
    // unchanged columns have the same old/new value.
    const oldFkValues = fkColumns.map((col) => {
      const change = changes[col];
      if (change) return change[0];
      return typeof record.readAttribute === "function" ? record.readAttribute(col) : record[col];
    });
    const foreignTypeCol = `${underscore(name)}_type`;
    const hasOldFk =
      fkColumns.some((col) => changes[col] != null) || changes[foreignTypeCol] != null;

    if (hasOldFk) {
      const association =
        typeof record.association === "function" ? record.association(name) : null;
      if (association) {
        const reflection = association.reflection;
        let klass: any;
        const isPolymorphic =
          reflection?.options?.polymorphic ??
          (typeof reflection?.isPolymorphic === "function" && reflection.isPolymorphic());
        if (isPolymorphic) {
          const foreignType =
            reflection?.foreignType ??
            reflection?.options?.foreignType ??
            `${underscore(name)}_type`;
          const typeName =
            changes[foreignType]?.[0] ??
            (typeof record.readAttribute === "function"
              ? record.readAttribute(foreignType)
              : record[foreignType]);
          try {
            klass = typeName ? resolveModel(typeName) : null;
          } catch {
            klass = null;
          }
        } else {
          klass = association.klass;
        }
        if (klass) {
          const pk = BelongsTo.resolvePk(reflection, klass);
          const oldFkValue = fkColumns.length === 1 ? oldFkValues[0] : oldFkValues;
          const conditions = BelongsTo.buildFindConditions(pk, oldFkValue);
          if (conditions && typeof klass.findBy === "function") {
            const oldRecord = await klass.findBy(conditions);
            if (oldRecord) await BelongsTo.touchParent(oldRecord, touch);
          }
        }
      }
    }

    // Touch the current parent by looking it up via FK value.
    const currentFkValues = fkColumns.map((col) =>
      typeof record.readAttribute === "function" ? record.readAttribute(col) : record[col],
    );
    if (currentFkValues.every((v) => v != null)) {
      const association =
        typeof record.association === "function" ? record.association(name) : null;
      if (association) {
        const klass = association.klass;
        if (klass && typeof klass.findBy === "function") {
          const pk = BelongsTo.resolvePk(association.reflection, klass);
          const fkValue = fkColumns.length === 1 ? currentFkValues[0] : currentFkValues;
          const conditions = BelongsTo.buildFindConditions(pk, fkValue);
          if (conditions) {
            const parent = await klass.findBy(conditions);
            if (parent) await BelongsTo.touchParent(parent, touch);
          }
        }
      }
    }
  }

  static addTouchCallbacks(model: any, reflection: any): void {
    const foreignKey =
      reflection.foreignKey ??
      reflection.options?.foreignKey ??
      reflection.options?.queryConstraints;
    const name = reflection.name;
    const touch = reflection.options?.touch;

    const makeCallback = (changesMethod: string) => async (record: any) => {
      const raw = record[changesMethod];
      const changes = (typeof raw === "function" ? raw.call(record) : raw) ?? {};
      await BelongsTo.touchRecord(record, changes, foreignKey, name, touch);
    };

    afterCreate(model, makeCallback("savedChanges"));
    afterUpdate(model, makeCallback("savedChanges"));
    afterDestroy(model, async (record: any) => {
      if (typeof record.isNewRecord !== "function" || !record.isNewRecord()) {
        await BelongsTo.touchRecord(record, {}, foreignKey, name, touch);
      }
    });

    if (typeof model.afterTouch === "function") {
      model.afterTouch(async (record: any) => {
        if ((record as any)._touchingAssociations) return;
        (record as any)._touchingAssociations = true;
        try {
          await makeCallback("changesToSave")(record);
        } finally {
          (record as any)._touchingAssociations = false;
        }
      });
    }
  }

  static addDefaultCallbacks(model: any, reflection: any): void {
    beforeValidation(model, (record: any) => {
      if (typeof record.association === "function") {
        const assoc = record.association(reflection.name);
        if (typeof assoc.default === "function") {
          assoc.default(reflection.options?.default);
        }
      }
    });
  }

  static override addDestroyCallbacks(model: any, reflection: any): void {
    const name = reflection.name;
    afterDestroy(model, (record: any) => {
      return record.association(name).handleDependency();
    });
  }

  static override defineValidations(model: any, reflection: any): void {
    const options = reflection.options ?? {};

    if ("required" in options) {
      options.optional = !options.required;
      delete options.required;
    }

    let required: boolean;
    if (options.optional == null) {
      required = !!(model.belongsToRequiredByDefault ?? false);
    } else {
      required = !options.optional;
    }

    super.defineValidations(model, reflection);

    if (required) {
      // Rails validates the association name (reflection.name) which
      // checks whether the associated record can be loaded. Our codebase
      // validates the foreign key directly since association-aware presence
      // validation is not yet wired. The effect is the same: reject nil FK.
      const rawFk =
        reflection.foreignKey ?? options.foreignKey ?? `${underscore(reflection.name)}_id`;
      const foreignKeys = Array.isArray(rawFk) ? rawFk : [rawFk];

      if (model.belongsToRequiredValidatesForeignKey ?? true) {
        if (typeof model.validatesPresenceOf === "function") {
          for (const key of foreignKeys) {
            model.validatesPresenceOf(key, { message: "required" });
          }
        } else if (typeof model.validates === "function") {
          for (const key of foreignKeys) {
            model.validates(key, { presence: true });
          }
        }
      } else {
        const foreignTypes = reflection.options?.polymorphic
          ? Array.isArray(reflection.foreignType)
            ? (reflection.foreignType as string[])
            : [reflection.foreignType ?? `${underscore(reflection.name)}_type`]
          : [];

        const needsValidation = (record: any, attrs: string[]) =>
          attrs.some(
            (attr) =>
              record.readAttribute(attr) == null ||
              (typeof record.attributeChanged === "function" && record.attributeChanged(attr)),
          );

        const condition = (record: any) =>
          needsValidation(record, foreignKeys) ||
          (reflection.options?.polymorphic && needsValidation(record, foreignTypes));

        if (typeof model.validates === "function") {
          for (const key of foreignKeys) {
            model.validates(key, { presence: true, if: condition });
          }
        }
      }
    }
  }

  static override defineChangeTrackingMethods(model: any, reflection: any): void {
    const mixin = model.prototype ?? model;
    if (!mixin || typeof mixin !== "object") return;
    const name = reflection.name ?? reflection;

    for (const [methodName, impl] of [
      [
        `${name}Changed`,
        function (this: any) {
          return this.association(name).isTargetChanged();
        },
      ],
      [
        `${name}PreviouslyChanged`,
        function (this: any) {
          return this.association(name).isTargetPreviouslyChanged();
        },
      ],
    ] as [string, () => any][]) {
      const existing = Object.getOwnPropertyDescriptor(mixin, methodName);
      if (existing && !existing.configurable) continue;
      Object.defineProperty(mixin, methodName, {
        value: impl,
        writable: true,
        configurable: true,
      });
    }
  }
}
