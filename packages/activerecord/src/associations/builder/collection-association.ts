import { singularize } from "@blazetrails/activesupport";
import { Association } from "./association.js";
import { association } from "../../associations.js";

const CALLBACKS = ["beforeAdd", "afterAdd", "beforeRemove", "afterRemove"] as const;

/**
 * Base builder for has_many and HABTM associations.
 *
 * Mirrors: ActiveRecord::Associations::Builder::CollectionAssociation
 */
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
  }

  static override defineExtensions(model: any, name: string, block?: Function): any {
    if (block) {
      const extensionModuleName = `${name.charAt(0).toUpperCase()}${name.slice(1)}AssociationExtension`;
      const extension = { name: extensionModuleName, block };
      (model as any)[extensionModuleName] = extension;
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
      ? (options[callbackName] as any[])
      : options[callbackName] != null
        ? [options[callbackName]]
        : [];

    if (callbackValues.length === 0) return;

    const normalized = callbackValues.map((callback: any) => {
      if (typeof callback === "string" || typeof callback === "symbol") {
        return (owner: any, record: any) => owner[callback](record);
      } else if (typeof callback === "function") {
        return (owner: any, record: any) => callback(owner, record);
      } else {
        return (owner: any, record: any) => callback.call(owner, record);
      }
    });

    // Store on model class for Rails parity (class_attribute pattern)
    const fullCallbackName = `${callbackName}For${name.charAt(0).toUpperCase()}${name.slice(1)}`;
    const existing = Object.prototype.hasOwnProperty.call(model, fullCallbackName)
      ? model[fullCallbackName]
      : undefined;
    const prior = Array.isArray(existing) ? existing : [];
    model[fullCallbackName] = [...prior, ...normalized];

    // Also store normalized callbacks in the association options so
    // fireAssocCallbacks (which reads options.beforeAdd etc.) finds them
    const assocs: any[] = model._associations ?? [];
    const assocDef = assocs.find((a: any) => a.name === name);
    if (assocDef) {
      assocDef.options[callbackName] = model[fullCallbackName];
    }
  }

  // Phase R.2: collection association readers return the AssociationProxy
  // — the same chainable, awaitable, array-shaped surface Rails'
  // `blog.posts` returns. Matches Rails'
  // `activerecord/lib/active_record/associations/collection_association.rb#reader`
  // (`@proxy ||= CollectionProxy.create(klass, self).reset_scope`).
  //
  // Sync access (`for...of`, `.length`, `.map`, `proxy[0]`) reads the
  // loaded `_target` via the array-likeness landed in Phase R.1; chainable
  // calls (`blog.posts.where(...).order(...)`) flow through the
  // `wrapCollectionProxy` Proxy delegation; `await blog.posts` hydrates
  // and yields a plain array.
  static override defineReaders(mixin: any, name: string): void {
    if (!mixin || typeof mixin !== "object") return;

    // Override the main `<name>` getter to return the AssociationProxy
    // (Rails-faithful). Skip `super.defineReaders(...)` for the main
    // name — it would install the array reader, which we're replacing.
    const existing = Object.getOwnPropertyDescriptor(mixin, name);
    if (!existing || existing.configurable) {
      Object.defineProperty(mixin, name, {
        get(this: any) {
          return association(this, name);
        },
        set: existing?.set,
        configurable: true,
      });
    }

    // `<singularized>Ids` reader stays as before (not a collection of
    // records — just the FK list).
    const idsName = `${singularize(name)}Ids`;
    if (!(idsName in mixin)) {
      Object.defineProperty(mixin, idsName, {
        get(this: any) {
          return this.association(name).idsReader();
        },
        configurable: true,
      });
    }
  }

  static override defineWriters(mixin: any, name: string): void {
    super.defineWriters(mixin, name);
    if (!mixin || typeof mixin !== "object") return;
    const idsName = `${singularize(name)}Ids`;
    const existing = Object.getOwnPropertyDescriptor(mixin, idsName);
    if (existing && !existing.configurable) return;
    Object.defineProperty(mixin, idsName, {
      get: existing?.get,
      set(this: any, ids: any) {
        this.association(name).idsWriter(ids);
      },
      configurable: true,
    });
  }
}
