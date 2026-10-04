import { Module, rbObjRespondTo } from "@blazetrails/ruby-compat";
import { camelize, classAttribute, kernelArray, singularize } from "@blazetrails/activesupport";
import { Association, type AssociationInstanceHost } from "./association.js";

/** @noRailsEquivalent CONVERGEABLE retire-ids-name-helper-constructor-dispatch */
export function idsName(name: string): string {
  return `${singularize(name)}Ids`;
}

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
    const name = reflection.name;
    const options = reflection.options;
    for (const callbackName of CALLBACKS) {
      this.defineCallback(model, callbackName, name, options);
    }
  }

  static override defineExtensions(
    model: any,
    name: string,
    block?: (mod: Module) => void,
  ): Module | undefined {
    if (block) {
      const extensionModuleName = `${camelize(name)}AssociationExtension`;
      const extension = new Module(block);
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
    const fullCallbackName = `${callbackName}For${name.charAt(0).toUpperCase()}${name.slice(1)}`;

    const callbackValues = kernelArray(options[callbackName]);
    const methodDefined = rbObjRespondTo(model, fullCallbackName);

    if (callbackValues.length === 0 && !methodDefined) return;

    if (!methodDefined) {
      classAttribute.call(model, fullCallbackName, {
        instanceAccessor: false,
        instancePredicate: false,
      });
    }

    const callbacks = callbackValues.map((callback: any) => {
      if (typeof callback === "string") {
        return (_method: string, owner: any, record: any) => owner[callback](record);
      } else if (typeof callback === "function") {
        return (_method: string, owner: any, record: any) => callback(owner, record);
      } else {
        return (method: string, owner: any, record: any) => callback[method](owner, record);
      }
    });
    model[fullCallbackName] = callbacks;
  }

  static override defineReaders(mixin: Module, name: string): void {
    super.defineReaders(mixin, name);

    mixin.moduleEval((m) => {
      Object.defineProperty(m, idsName(name), {
        get(this: AssociationInstanceHost) {
          return this.association(name).idsReader();
        },
        configurable: true,
      });
    });
  }

  static override defineWriters(mixin: Module, name: string): void {
    mixin.defineMethod(`${name}=`, function (this: AssociationInstanceHost, value: unknown) {
      return this.association(name).writer(value);
    });
    mixin.defineMethod(
      `${idsName(name)}=`,
      function (this: AssociationInstanceHost, value: unknown) {
        return this.association(name).idsWriter(value);
      },
    );
  }
}
