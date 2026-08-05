import { singularize } from "@blazetrails/activesupport";
import { Association, type AssociationInstanceHost } from "./association.js";
import { association } from "../../associations.js";
import type { Base } from "../../base.js";
import { addAutosaveAssociationCallbacks } from "../../autosave-association.js";

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
    // Mirrors Rails AutosaveAssociation::AssociationBuilderExtension.build —
    // save_collection_association is registered for every collection
    // association regardless of the `autosave:` option. The option only
    // gates extra behavior inside save_collection_association; insert-of-new
    // children must always propagate so failures surface on owner.save.
    addAutosaveAssociationCallbacks(model, reflection);
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

    // Mirrors Rails: `method_defined = model.respond_to?(full_callback_name)` —
    // respond_to? checks the full inheritance chain, so `in` is the JS analogue.
    const isMethodDefined = fullCallbackName in model;

    // Rails: `return if callback_values.empty? && !method_defined`
    if (callbackValues.length === 0) {
      if (!isMethodDefined) return;
      // Inherited but redefining without callbacks — shadow with own [] so the
      // subclass doesn't inherit the parent's callback list.
      if (!Object.prototype.hasOwnProperty.call(model, fullCallbackName)) {
        model[fullCallbackName] = [];
      }
      return;
    }

    // Mirrors Rails' three arms (builder/collection_association.rb:44-52). All
    // three take `(method, owner, record)` — the `method` (callback kind) is
    // unused by the symbol/proc arms but IS what the object arm dispatches on,
    // so it has to be threaded through rather than bound here.
    const normalized = callbackValues.map((callback: any) => {
      if (typeof callback === "string" || typeof callback === "symbol") {
        // Rails: `->(method, owner, record) { owner.send(callback, record) }`
        return (_method: string, owner: any, record: any) => owner[callback](record);
      } else if (typeof callback === "function") {
        // Rails: `->(method, owner, record) { callback.call(owner, record) }`
        return (_method: string, owner: any, record: any) => callback(owner, record);
      } else {
        // Rails: `->(method, owner, record) { callback.send(method, owner, record) }`
        // — an object callback responds to the callback kind itself, e.g.
        // `before_add: SomeAuditor` invokes `SomeAuditor.before_add(owner, record)`.
        return (method: string, owner: any, record: any) => callback[method](owner, record);
      }
    });

    const existing = Object.prototype.hasOwnProperty.call(model, fullCallbackName)
      ? model[fullCallbackName]
      : undefined;
    const prior = Array.isArray(existing) ? existing : [];
    model[fullCallbackName] = [...prior, ...normalized];

    // Also store normalized callbacks in the association options so
    // `CollectionAssociation#callback`'s `callbacksFor` fallback (which reads
    // options.beforeAdd etc.) finds them
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
  static override defineReaders(mixin: object, name: string): void {
    if (!mixin || typeof mixin !== "object") return;

    // Override the main `<name>` getter to return the AssociationProxy
    // (Rails-faithful). Skip `super.defineReaders(...)` for the main
    // name — it would install the array reader, which we're replacing.
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

    // `<singularized>Ids` reader stays as before (not a collection of
    // records — just the FK list).
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

  // Rails' `Builder::CollectionAssociation.define_writers`
  // (builder/collection_association.rb:67-74) calls `super` — which defines
  // `#{name}=` — and adds `#{name.singularize}_ids=`. Both of Rails' writers
  // do DB I/O at assignment time: `writer` runs `replace`'s diffed
  // deletes+inserts in a transaction (collection_association.rb:46-48, :242),
  // and `ids_writer` resolves the ids with a query first
  // (collection_association.rb:61-83). A JS property setter cannot `await`, so
  // neither is expressible as one. The awaitable ports carry the Rails names
  // on the association itself — `association(name).writer` / `replace` /
  // `idsWriter` — and are the only collection-mutation surface (RFC 0087 §1).
  static override defineWriters(_mixin: object, _name: string): void {}
}
