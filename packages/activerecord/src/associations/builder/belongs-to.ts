import { underscore, pluralize, isBlank, safeConstantize } from "@blazetrails/activesupport";
import type { AssociationInstanceHost } from "./association.js";
import { SingularAssociation } from "./singular-association.js";
import { addAutosaveAssociationCallbacks } from "../../autosave-association.js";
import { pendingCounterCacheColumns } from "../../counter-cache-state.js";
import { ActiveRecord } from "../../ar-config.js";

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
    const options = reflection.options ?? {};
    const dependent = options.dependent;
    if (dependent) {
      this.checkDependentOptions(dependent as string, model);
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
    addAutosaveAssociationCallbacks.call(model, reflection);
  }

  static addCounterCacheCallbacks(model: any, reflection: any): void {
    const name = reflection.name;

    const cacheColumn = (): string =>
      (typeof reflection.counterCacheColumn === "function"
        ? reflection.counterCacheColumn()
        : null) ?? `${pluralize(underscore(model.name))}_count`;
    const klass = safeConstantize(reflection.className) as any;
    if (!klass) {
      const pending =
        pendingCounterCacheColumns.get(reflection.className) ?? new Set<() => string>();
      pending.add(cacheColumn);
      pendingCounterCacheColumns.set(reflection.className, pending);
    } else if ("_counterCacheColumns" in klass) {
      const column = cacheColumn();
      if (!klass._counterCacheColumns.includes(column)) {
        klass._counterCacheColumns = [...klass._counterCacheColumns, column];
      }
    }

    if (!model.counterCachedAssociationNames.includes(name)) {
      model.counterCachedAssociationNames = [...model.counterCachedAssociationNames, name];
    }

    model.afterUpdate(async (record: any) => {
      const assoc = record.association(name);
      if (assoc.isSavedChangeToTarget()) {
        await assoc.incrementCounters();
        await assoc.decrementCountersBeforeLastSave();
      }
    });
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
  ): Record<string, unknown> | null {
    if (Array.isArray(pk)) {
      const values = Array.isArray(fkValue) ? fkValue : [fkValue];
      if (pk.length !== values.length) return null;
      if (values.some((v) => v == null)) return null;
      return Object.fromEntries(pk.map((key, i) => [key, values[i]]));
    }
    if (fkValue == null) return null;
    return { [pk]: fkValue };
  }

  /** @missingRailsCall first — PERMANENT */
  static async touchRecord(
    o: any,
    changes: Record<string, unknown>,
    foreignKey: string | string[],
    name: string,
    touch: any,
  ): Promise<void> {
    const fkColumns = Array.isArray(foreignKey) ? foreignKey : [foreignKey];

    const oldFkValues = fkColumns.map((col) => {
      const change = changes[col] as [unknown, unknown] | undefined;
      if (change) return change[0];
      return typeof o._readAttribute === "function" ? o._readAttribute(col) : o[col];
    });
    const foreignTypeCol = `${underscore(name)}_type`;
    const hasOldFk =
      fkColumns.some((col) => changes[col] != null) || changes[foreignTypeCol] != null;

    if (hasOldFk) {
      const association = typeof o.association === "function" ? o.association(name) : null;
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
          klass =
            (changes[foreignType] as [unknown, unknown] | undefined)?.[0] ??
            (typeof o._readAttribute === "function"
              ? o._readAttribute(foreignType)
              : o[foreignType]);
          try {
            klass = klass
              ? (o.constructor as { polymorphicClassFor(name: string): any }).polymorphicClassFor(
                  klass,
                )
              : null;
          } catch {
            klass = null;
          }
        } else {
          klass = association.klass;
        }
        if (klass) {
          const pk = reflection.associationPrimaryKey(klass);
          const oldFkValue = fkColumns.length === 1 ? oldFkValues[0] : oldFkValues;
          const conditions = BelongsTo.buildFindConditions(pk, oldFkValue);
          if (conditions && typeof klass.findBy === "function") {
            const oldRecord = await klass.findBy(conditions);
            if (oldRecord) await BelongsTo.touchParent(oldRecord, touch);
          }
        }
      }
    }

    const association = typeof o.association === "function" ? o.association(name) : null;
    if (association && typeof association.loadTarget === "function") {
      const parent = await association.loadTarget();
      if (parent && !Array.isArray(parent) && parent.isPersisted?.()) {
        await BelongsTo.touchParent(parent, touch);
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

    const hasCounterCache =
      typeof reflection.counterCacheColumn === "function" &&
      reflection.counterCacheColumn() != null;
    if (hasCounterCache) {
      model.afterUpdate(async (record: any) => {
        if (typeof record.isSavedChanges === "function" && !record.isSavedChanges()) return;
        const assoc =
          typeof record.association === "function" ? record.association(name) : undefined;
        if (assoc && typeof assoc.isSavedChangeToTarget === "function") {
          if (assoc.isSavedChangeToTarget()) return;
        }
        await makeCallback("savedChanges")(record);
      });
    } else {
      model.afterCreate(makeCallback("savedChanges"));
      model.afterUpdate(makeCallback("savedChanges"));
      model.afterDestroy(async (record: any) => {
        if (typeof record.isNewRecord !== "function" || !record.isNewRecord()) {
          await BelongsTo.touchRecord(record, {}, foreignKey, name, touch);
        }
      });
    }

    if (typeof model.afterTouch === "function") {
      model.afterTouch(async (record: any) => {
        if (record._touchingAssociations) return;
        record._touchingAssociations = true;
        try {
          await makeCallback("changesToSave")(record);
        } finally {
          record._touchingAssociations = false;
        }
      });
    }
  }

  static addDefaultCallbacks(model: any, reflection: any): void {
    model.beforeValidation((record: any) => {
      if (record._belongsToDefaultsApplied) return;
      if (typeof record.association !== "function") return;
      const assoc = record.association(reflection.name);
      if (typeof assoc.default === "function") {
        void assoc.default(reflection.options?.default);
      }
    });
  }

  static override addDestroyCallbacks(model: any, reflection: any): void {
    const name = reflection.name;
    model.afterDestroy((record: any) => {
      return record.association(name).handleDependency();
    });
  }

  /** @missingRailsCall delete — PERMANENT */
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

    if (required && typeof model.validatesPresenceOf === "function") {
      const name = reflection.name;
      const polymorphic = !!reflection.options?.polymorphic;
      const rawFk =
        reflection.foreignKey ?? options.foreignKey ?? `${underscore(reflection.name)}_id`;
      const foreignKeys = Array.isArray(rawFk) ? rawFk : [rawFk];
      const foreignTypes = polymorphic
        ? Array.isArray(reflection.foreignType)
          ? (reflection.foreignType as string[])
          : [reflection.foreignType ?? `${underscore(reflection.name)}_type`]
        : [];

      const foreignKeyPresent = (record: any): boolean => {
        if (foreignKeys.length === 0) return false;
        if (!foreignKeys.every((key) => !isBlank(record._readAttribute(key)))) return false;
        if (!polymorphic) return true;
        return foreignTypes.every((type) => !isBlank(record._readAttribute(type)));
      };

      const needsValidation = (record: any, attrs: string[]) =>
        attrs.some(
          (attr) =>
            record._readAttribute(attr) == null ||
            (typeof record.attributeChanged === "function" && record.attributeChanged(attr)),
        );
      const railsRuns = ActiveRecord.belongsToRequiredValidatesForeignKey
        ? () => true
        : (record: any) =>
            needsValidation(record, foreignKeys) ||
            (polymorphic && needsValidation(record, foreignTypes));

      const condition: (record: any) => boolean = (record) =>
        railsRuns(record) && !foreignKeyPresent(record);

      model.validatesPresenceOf(name, { message: ":required", if: condition });

      model.validate(
        async (record: any) => {
          let target: unknown = null;
          if (typeof record.association === "function") {
            target = await record.association(name).loadTarget();
          }
          if (target == null) {
            record.errors.add(name, ":blank", { message: ":required" });
          }
        },
        { if: (record: any) => railsRuns(record) && foreignKeyPresent(record) },
      );
    }
  }

  static override defineChangeTrackingMethods(model: any, reflection: any): void {
    const mixin = model.prototype ?? model;
    if (!mixin || typeof mixin !== "object") return;
    const name = reflection.name ?? reflection;

    for (const [methodName, impl] of [
      [
        `${name}Changed`,
        function (this: AssociationInstanceHost) {
          return this.association(name).isTargetChanged();
        },
      ],
      [
        `${name}PreviouslyChanged`,
        function (this: AssociationInstanceHost) {
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
