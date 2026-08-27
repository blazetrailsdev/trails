import { ArgumentError } from "@blazetrails/activemodel";
import { assertValidKeys, throwAbort } from "@blazetrails/activesupport";
import { ConfigurationError, RecordNotDestroyed } from "../../errors.js";
import * as Reflection from "../../reflection.js";

/** @internal */
export interface AssociationInstanceHost {
  association(name: string): AssociationProxyLike;
}

/** @internal */
export interface AssociationProxyLike {
  reader: unknown;
  writer(value: unknown): void;
  idsReader(): unknown;
  idsWriter(ids: unknown): void;
  forceReloadReader(): unknown;
  reset(): unknown;
  build(...args: unknown[]): unknown;
  create(...args: unknown[]): unknown;
  createBang(...args: unknown[]): unknown;
  isTargetChanged(): boolean;
  isTargetPreviouslyChanged(): boolean;
}

type ExtensionModule = {
  validOptions?: () => string[];
  build?: (model: any, reflection: any) => void;
};

export class Association {
  private static _extensions: ExtensionModule[] = [];

  static get extensions(): ExtensionModule[] {
    if (!Object.prototype.hasOwnProperty.call(this, "_extensions")) {
      this._extensions = [...(Object.getPrototypeOf(this)._extensions ?? [])];
    }
    return this._extensions;
  }

  static set extensions(value: ExtensionModule[]) {
    this._extensions = value;
  }

  get extensions(): ExtensionModule[] {
    return (this.constructor as typeof Association).extensions;
  }

  set extensions(value: ExtensionModule[]) {
    (this.constructor as typeof Association).extensions = value;
  }

  static readonly VALID_OPTIONS: readonly string[] = [
    "className",
    "anonymousClass",
    "primaryKey",
    "foreignKey",
    "dependent",
    "validate",
    "inverseOf",
    "strictLoading",
    "queryConstraints",
  ];

  static build(
    model: any,
    name: string,
    scope: ((...args: any[]) => any) | null | Record<string, unknown>,
    options: Record<string, unknown> = {},
  ): any {
    if (
      typeof scope === "object" &&
      scope !== null &&
      !Array.isArray(scope) &&
      !(scope instanceof Function)
    ) {
      options = scope;
      scope = null;
    }

    if (
      typeof model.isDangerousAttributeMethod === "function" &&
      model.isDangerousAttributeMethod(name)
    ) {
      throw new ArgumentError(
        `You tried to define an association named ${name} on the model ${model.name}, but ` +
          `this will conflict with a method ${name} already defined by Active Record. ` +
          `Please choose a different association name.`,
      );
    }

    const reflection = this.createReflection(model, name, scope as any, options);
    this.defineAccessors(model, reflection);
    this.defineCallbacks(model, reflection);
    this.defineValidations(model, reflection);
    this.defineChangeTrackingMethods(model, reflection);
    return reflection;
  }

  static createReflection(
    model: any,
    name: string,
    scope: ((...args: any[]) => any) | null,
    options: Record<string, unknown>,
  ): any {
    if (typeof name !== "string") {
      throw new Error("association names must be a string");
    }

    this.validateOptions(options);

    const extension = this.defineExtensions(model, name);
    if (extension) {
      options.extend = [
        ...(options.extend
          ? Array.isArray(options.extend)
            ? options.extend
            : [options.extend]
          : []),
        extension,
      ];
    }

    scope = this.buildScope(scope);

    const macro = this.macro();
    return Reflection.create(macro as any, name, scope, options, model);
  }

  static buildScope(scope: ((...args: any[]) => any) | null): ((...args: any[]) => any) | null {
    if (scope && scope.length === 0) {
      const orig = scope;
      return function (this: unknown) {
        return orig.call(this);
      };
    }
    return scope;
  }

  static macro(): string {
    throw new Error("NotImplementedError");
  }

  static validOptions(_options: Record<string, unknown>): string[] {
    const extensionOpts = this.extensions.flatMap((ext) =>
      typeof ext.validOptions === "function" ? ext.validOptions() : [],
    );
    return [...this.VALID_OPTIONS, ...extensionOpts];
  }

  static validateOptions(options: Record<string, unknown>): void {
    assertValidKeys(options, this.validOptions(options));
  }

  static defineExtensions(_model: any, _name: string): any {
    return undefined;
  }

  static defineCallbacks(model: any, reflection: any): void {
    const dependent = reflection.options?.dependent;
    if (dependent) {
      this.checkDependentOptions(dependent, model);
      this.addDestroyCallbacks(model, reflection);
      this.addAfterCommitJobsCallback(model, dependent);
    }

    for (const extension of this.extensions) {
      if (typeof extension.build === "function") {
        extension.build(model, reflection);
      }
    }
  }

  static defineAccessors(model: any, reflection: any): void {
    const mixin = model.prototype ?? model;
    const name = reflection.name ?? reflection;
    this.defineReaders(mixin, name);
    this.defineWriters(mixin, name);
  }

  static defineReaders(mixin: object, name: string): void {
    if (!mixin || typeof mixin !== "object") return;
    const existing = Object.getOwnPropertyDescriptor(mixin, name);
    if (existing && !existing.configurable) return;
    Object.defineProperty(mixin, name, {
      get(this: AssociationInstanceHost) {
        return this.association(name).reader;
      },
      set: existing?.set,
      configurable: true,
    });
  }

  static defineWriters(mixin: object, name: string): void {
    if (!mixin || typeof mixin !== "object") return;
    const existing = Object.getOwnPropertyDescriptor(mixin, name);
    if (existing && !existing.configurable) return;
    Object.defineProperty(mixin, name, {
      get: existing?.get,
      set(this: AssociationInstanceHost, value: unknown) {
        this.association(name).writer(value);
      },
      configurable: true,
    });
  }

  static defineValidations(_model: any, _reflection: any): void {}

  static defineChangeTrackingMethods(_model: any, _reflection: any): void {}

  static validDependentOptions(): string[] {
    throw new Error("NotImplementedError");
  }

  static checkDependentOptions(dependent: string, model: any): void {
    if (dependent === "destroyAsync" && !model.destroyAssociationAsyncJob()) {
      throw new ConfigurationError(
        "A valid destroyAssociationAsyncJob is required to use `dependent: destroyAsync` on associations",
      );
    }
    const validOptions = this.validDependentOptions();
    if (!validOptions.includes(dependent)) {
      throw new ArgumentError(
        `The :dependent option must be one of ${validOptions.join(", ")}, but is :${dependent}`,
      );
    }
  }

  static addDestroyCallbacks(model: any, reflection: any): void {
    const name = reflection.name ?? reflection;
    model.beforeDestroy(async (record: any) => {
      try {
        if ((await record.association(name).handleDependency()) === false) throwAbort();
      } catch (e) {
        if (e instanceof RecordNotDestroyed) {
          record._associationDestroyException = e;
          throwAbort();
        }
        throw e;
      }
    });
  }

  static addAfterCommitJobsCallback(_model: any, _dependent: string): void {}
}
