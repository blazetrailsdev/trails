import { singularize } from "@blazetrails/activesupport";
import { Association, type AssociationInstanceHost } from "./association.js";
import { association } from "../../associations.js";
import type { Base } from "../../base.js";
import { addAutosaveAssociationCallbacks } from "../../autosave-association.js";

const CALLBACKS = ["beforeAdd", "afterAdd", "beforeRemove", "afterRemove"] as const;

export class CollectionAssociation extends Association {
  static override validOptions(options: Record<string, unknown>): string[] {
    return [
      ...super.validOptions(options),
      "beforeAdd",
      "afterAdd",
      "beforeRemove",
      "afterRemove",
      "extend",
    ];
  }

  static override defineCallbacks(model: any, reflection: any): void {
    super.defineCallbacks(model, reflection);
    const name = reflection.name ?? reflection;
    const options = reflection.options ?? {};
    for (const callbackName of CALLBACKS) {
      this.defineCallback(model, callbackName, name, options);
    }
    addAutosaveAssociationCallbacks.call(model, reflection);
  }

  static override defineExtensions(model: any, name: string, block?: (...args: any[]) => any): any {
    if (block) {
      const extensionModuleName = `${name.charAt(0).toUpperCase()}${name.slice(1)}AssociationExtension`;
      const extension = { name: extensionModuleName, block };
      model[extensionModuleName] = extension;
      return extension;
    }
    return undefined;
  }

  static defineCallback(
    model: any,
    callbackName: string,
    name: string,
    options: Record<string, unknown>,
  ): void {
    const callbackValues = Array.isArray(options[callbackName])
      ? options[callbackName]
      : options[callbackName] != null
        ? [options[callbackName]]
        : [];

    const fullCallbackName = `${callbackName}For${name.charAt(0).toUpperCase()}${name.slice(1)}`;

    const isMethodDefined = fullCallbackName in model;

    if (callbackValues.length === 0) {
      if (!isMethodDefined) return;
      if (!Object.prototype.hasOwnProperty.call(model, fullCallbackName)) {
        model[fullCallbackName] = [];
      }
      return;
    }

    const normalized = callbackValues.map((callback: any) => {
      if (typeof callback === "string" || typeof callback === "symbol") {
        return (_method: string, owner: any, record: any) => owner[callback](record);
      } else if (typeof callback === "function") {
        return (_method: string, owner: any, record: any) => callback(owner, record);
      } else {
        return (method: string, owner: any, record: any) => callback[method](owner, record);
      }
    });

    const existing = Object.prototype.hasOwnProperty.call(model, fullCallbackName)
      ? model[fullCallbackName]
      : undefined;
    const prior = Array.isArray(existing) ? existing : [];
    model[fullCallbackName] = [...prior, ...normalized];

    const reflection = model._reflectOnAssociation?.(name);
    if (reflection) {
      reflection.options[callbackName] = model[fullCallbackName];
    }
  }

  static override defineReaders(mixin: object, name: string): void {
    if (!mixin || typeof mixin !== "object") return;

    const existing = Object.getOwnPropertyDescriptor(mixin, name);
    if (!existing || existing.configurable) {
      Object.defineProperty(mixin, name, {
        get(this: Base) {
          return association(this, name);
        },
        set: existing?.set,
        configurable: true,
      });
    }

    const idsName = `${singularize(name)}Ids`;
    if (!(idsName in mixin)) {
      Object.defineProperty(mixin, idsName, {
        get(this: AssociationInstanceHost) {
          return this.association(name).idsReader();
        },
        configurable: true,
      });
    }
  }

  static override defineWriters(mixin: object, name: string): void {
    if (!mixin || typeof mixin !== "object") return;
    Object.defineProperty(mixin, `${name}=`, {
      value(this: AssociationInstanceHost, value: unknown): unknown {
        return this.association(name).writer(value);
      },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(mixin, `${singularize(name)}Ids=`, {
      value(this: AssociationInstanceHost, value: unknown): unknown {
        return this.association(name).idsWriter(value);
      },
      writable: true,
      configurable: true,
    });
  }
}
