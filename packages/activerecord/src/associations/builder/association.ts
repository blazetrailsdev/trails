import { ArgumentError } from "@blazetrails/activemodel";
import { NotImplementedError, kernelThrow, type Module } from "@blazetrails/ruby-compat";
import { assertValidKeys } from "@blazetrails/activesupport";
import { ConfigurationError, RecordNotDestroyed } from "../../errors.js";
import { _Reflection } from "../../reflection-slot.js";

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
    block?: (mod: Module) => void,
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

    const reflection = this.createReflection(model, name, scope as any, options, block);
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
    block?: (mod: Module) => void,
  ): any {
    if (typeof name !== "string") {
      throw new ArgumentError("association names must be a Symbol");
    }

    this.validateOptions(options);

    const extension = this.defineExtensions(model, name, block);
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
    return _Reflection!.create(macro as any, name, scope, options, model);
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
    // @nie disposition=keep-as-strategy-hook rails=activerecord/lib/active_record/associations/builder/association.rb:62
    throw new NotImplementedError();
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

  static defineExtensions(_model: any, _name: string, _block?: (mod: Module) => void): any {
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
    const mixin: Module = model.generatedAssociationMethods();
    const name = reflection.name;
    this.defineReaders(mixin, name);
    this.defineWriters(mixin, name);
  }

  static defineReaders(mixin: Module, name: string): void {
    mixin.moduleEval((m) => {
      Object.defineProperty(m, name, {
        get(this: AssociationInstanceHost) {
          return this.association(name).reader;
        },
        set: Object.getOwnPropertyDescriptor(m, name)?.set,
        configurable: true,
      });
    });
  }

  static defineWriters(mixin: Module, name: string): void {
    mixin.moduleEval((m) => {
      Object.defineProperty(m, name, {
        get: Object.getOwnPropertyDescriptor(m, name)?.get,
        set(this: AssociationInstanceHost, value: unknown) {
          this.association(name).writer(value);
        },
        configurable: true,
      });
    });
  }

  static defineValidations(_model: any, _reflection: any): void {}

  static defineChangeTrackingMethods(_model: any, _reflection: any): void {}

  static validDependentOptions(): string[] {
    // @nie disposition=keep-as-strategy-hook rails=activerecord/lib/active_record/associations/builder/association.rb:127
    throw new NotImplementedError();
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
        `The :dependent option must be one of [${validOptions.map((option) => `:${option}`).join(", ")}], but is :${dependent}`,
      );
    }
  }

  static addDestroyCallbacks(model: any, reflection: any): void {
    const name = reflection.name ?? reflection;
    model.beforeDestroy(async (record: any) => {
      try {
        await record.association(name).handleDependency();
      } catch (e) {
        if (e instanceof RecordNotDestroyed) {
          record._associationDestroyException = e;
          kernelThrow(":abort");
        }
        throw e;
      }
    });
  }

  static addAfterCommitJobsCallback(_model: any, _dependent: string): void {}
}
