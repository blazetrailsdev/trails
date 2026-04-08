/**
 * Base class for association builders. Configures association metadata
 * (reflection, callbacks, validations) based on options.
 *
 * Mirrors: ActiveRecord::Associations::Builder::Association
 */

import * as Reflection from "../../reflection.js";
import { beforeDestroy } from "../../callbacks.js";

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
    "autosave",
    "inverseOf",
    "strictLoading",
    "queryConstraints",
    "scope",
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
      options = scope as Record<string, unknown>;
      scope = null;
    }

    if (
      typeof model.isDangerousAttributeMethod === "function" &&
      model.isDangerousAttributeMethod(name)
    ) {
      throw new Error(
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

    // Extract scope from options if passed there (e.g., Associations.hasMany(name, { scope: fn }))
    if (!scope && typeof options.scope === "function") {
      scope = options.scope as (...args: any[]) => any;
      const { scope: _, ...rest } = options;
      options = rest;
    }

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
    const reflection = Reflection.create(macro as any, name, scope, options, model);

    this._ensureOwnAssociations(model);
    const assocOptions: Record<string, unknown> = { ...options };
    if (scope) assocOptions.scope = scope;
    model._associations.push({
      type: macro,
      name,
      options: assocOptions,
    });

    Reflection.addReflection(model, name, reflection as any);

    return reflection;
  }

  static buildScope(scope: ((...args: any[]) => any) | null): ((...args: any[]) => any) | null {
    if (scope && scope.length === 0) {
      const orig = scope;
      // Rails: proc { instance_exec(&scope) }
      // When scopeFor calls scope.call(relation, owner), `this` is the relation.
      // 0-arity scopes ignore the owner arg and execute with relation as context.
      return function (this: any) {
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
    const valid = new Set(this.validOptions(options));
    for (const key of Object.keys(options)) {
      if (!valid.has(key)) {
        throw new Error(
          `Unknown key: :${key}. Valid keys are: ${[...valid].map((k) => `:${k}`).join(", ")}`,
        );
      }
    }
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

  static defineReaders(mixin: any, name: string): void {
    if (!mixin || typeof mixin !== "object") return;
    const existing = Object.getOwnPropertyDescriptor(mixin, name);
    if (existing && !existing.configurable) return;
    Object.defineProperty(mixin, name, {
      get(this: any) {
        return this.association(name).reader;
      },
      set: existing?.set,
      configurable: true,
    });
  }

  static defineWriters(mixin: any, name: string): void {
    if (!mixin || typeof mixin !== "object") return;
    const existing = Object.getOwnPropertyDescriptor(mixin, name);
    if (existing && !existing.configurable) return;
    Object.defineProperty(mixin, name, {
      get: existing?.get,
      set(this: any, value: any) {
        this.association(name).writer(value);
      },
      configurable: true,
    });
  }

  static defineValidations(_model: any, _reflection: any): void {
    // noop in base — BelongsTo and HasOne override
  }

  static defineChangeTrackingMethods(_model: any, _reflection: any): void {
    // noop in base — BelongsTo overrides
  }

  static validDependentOptions(): string[] {
    throw new Error("NotImplementedError");
  }

  static checkDependentOptions(dependent: string, model: any): void {
    const validOptions = this.validDependentOptions();
    if (!validOptions.includes(dependent)) {
      throw new Error(
        `The :dependent option must be one of ${validOptions.join(", ")}, but is :${dependent}`,
      );
    }
    if (
      dependent === "destroyAsync" &&
      !(model._destroyAssociationAsyncJob ?? model.destroyAssociationAsyncJob)
    ) {
      throw new Error(
        "A valid destroyAssociationAsyncJob is required to use `dependent: destroyAsync` on associations",
      );
    }
  }

  static addDestroyCallbacks(model: any, reflection: any): void {
    const name = reflection.name ?? reflection;
    beforeDestroy(model, (record: any) => {
      return record.association(name).handleDependency();
    });
  }

  static addAfterCommitJobsCallback(_model: any, _dependent: string): void {
    // Rails registers an after_commit that runs _after_commit_jobs for
    // dependent: :destroy_async. Requires after_commit infrastructure
    // which is not yet wired to the callback chain — skip until then.
  }

  private static _ensureOwnAssociations(model: any): void {
    if (!Object.prototype.hasOwnProperty.call(model, "_associations")) {
      model._associations = [...(model._associations ?? [])];
    }
  }
}
