import { ArgumentError } from "@blazetrails/activemodel";
import { SingularAssociation } from "./singular-association.js";
import { afterCreate, afterUpdate, afterDestroy } from "../../callbacks.js";
import { afterCreateCommit } from "../../transactions.js";
import { addAutosaveAssociationCallbacks } from "../../autosave-association.js";

/**
 * Mirrors: ActiveRecord::Associations::Builder::HasOne
 */
export class HasOne extends SingularAssociation {
  static override macro(): string {
    return "hasOne";
  }

  static override validOptions(options: Record<string, unknown>): string[] {
    const valid = [...super.validOptions(options), "as", "through", "counterCache"];
    if (options.as) valid.push("foreignType");
    if (options.dependent === "destroyAsync") valid.push("ensuringOwnerWas");
    if (options.through) valid.push("source", "sourceType", "disableJoins");
    return valid;
  }

  static override build(
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
    if (options.counterCache) {
      throw new ArgumentError("has_one associations do not support counter_cache");
    }
    return super.build(model, name, scope, options);
  }

  static override defineConstructors(mixin: any, name: string): void {
    super.defineConstructors(mixin, name);
    if (!mixin || typeof mixin !== "object") return;
    const cap = name.charAt(0).toUpperCase() + name.slice(1);
    // Redefine the `build#{name}` accessor to mirror Rails' synchronous
    // `set_new_record` → `replace` → `load_target`: materialize the current
    // target before the built record displaces it. The accessor returns a
    // Promise (the sync `build` / nested-attributes paths can't await), so a
    // second build sees the loaded target and issues no query — one
    // `load_target` SELECT across repeated builds. `association.build` itself
    // stays synchronous for the in-memory internal paths.
    Object.defineProperty(mixin, `build${cap}`, {
      value: function (this: { association(n: string): any }, ...args: unknown[]) {
        const assoc = this.association(name);
        // Only take the async load path when a query would actually run: a
        // persisted / FK-present owner whose target isn't loaded. New-record
        // owners build synchronously (no query), so their `build#{name}` returns
        // the record directly and a synchronous build error (e.g. an invalid STI
        // type from `build_record`) still throws synchronously — the shape the
        // building-with-invalid-type tests assert. On the load path the same
        // error surfaces as a rejected Promise instead, an unavoidable
        // consequence of awaiting `load_target` in JS (Rails' `replace` is
        // fully synchronous, so it raises inline regardless of persistence).
        if (
          typeof assoc.needsTargetLoadForBuild === "function" &&
          assoc.needsTargetLoadForBuild()
        ) {
          // `loadTargetForBuild` loads the direct-FK target for a plain has_one
          // (the record `remove_target!` will detach), but a has_one_through
          // overrides it to load the *through* proxy — Rails' has_one_through
          // `replace` runs no `load_target`/`remove_target!` on the target; its
          // `create_through_record` loads the through instead. The through's
          // `detachDisplacedTarget` is a no-op, so the proxy passed as
          // `displaced` here is inert.
          return assoc.loadTargetForBuild().then((displaced: unknown) => {
            const record = buildOwningDisplacement(assoc, args);
            return assoc.detachDisplacedTarget(displaced).then(() => record);
          });
        }
        // The target may already be loaded (so `needsTargetLoadForBuild` is
        // false): Rails' `set_new_record` → `replace` still runs `remove_target!`
        // on it, detaching the prior record (FK nullified / destroyed per
        // `:dependent`). That removal needs an `await`, so return a Promise for
        // the loaded-target case only — a new-record / no-target build keeps its
        // synchronous return (the shape the STI-build tests assert).
        const displaced =
          typeof assoc.isLoaded === "function" && assoc.isLoaded() ? assoc.target : null;
        const record = buildOwningDisplacement(assoc, args);
        if (displaced && typeof assoc.detachDisplacedTarget === "function") {
          return assoc.detachDisplacedTarget(displaced).then(() => record);
        }
        return record;
      },
      writable: true,
      configurable: true,
    });
  }

  static override defineWriters(mixin: object, name: string): void {
    if (!mixin || typeof mixin !== "object") return;
    const cap = name.charAt(0).toUpperCase() + name.slice(1);
    // `set${cap}` IS the port of Rails' `#{name}=` writer: that writer removes
    // and persists the displaced target inline (has_one_association.rb:59-84),
    // blocking I/O a synchronous JS property setter cannot express but a
    // promise-returning method can. api:compare scores it as such —
    // `rubyMethodToTs` offers `set#{Name}` as a candidate for `name=`
    // (scripts/api-compare/conventions.ts). Generated
    // here — beside that setter, unconditionally (including polymorphic
    // has_one) — rather than in `defineConstructors`, which Rails skips for
    // polymorphic; the sugar must exist wherever the `=` setter does. A thin
    // delegation to the association-level `writer`, whose has_one /
    // has_one_through overrides run the Rails-faithful immediate replace/persist
    // and whose returned promise rejects (`RecordNotSaved`) at the call site.
    const setter = Object.getOwnPropertyDescriptor(mixin, `set${cap}`);
    if (!setter || setter.configurable) {
      Object.defineProperty(mixin, `set${cap}`, {
        value: function (
          this: { association(n: string): { writer(v: unknown): unknown } },
          value: unknown,
        ) {
          return this.association(name).writer(value);
        },
        writable: true,
        configurable: true,
      });
    }
    const existing = Object.getOwnPropertyDescriptor(mixin, name);
    if (existing && !existing.configurable) return;
    Object.defineProperty(mixin, name, {
      get: existing?.get,
      // The `=` setter exists because Rails defines `#{name}=` and dropping it
      // would report that method missing — but it is NOT the co-equal writer.
      // It is faithful on exactly one branch: an *unpersisted* owner, where
      // Rails' assignment is in-memory too, so `syncWrite` sets the FK/inverse
      // and lets autosave persist at the owner's first `save()`. On a
      // *persisted* owner it degrades to a deprecation shim: `syncWrite` throws
      // `HasOnePersistedAssignmentError` — a deliberate DEVIATION, since Rails
      // raises nothing there and simply persists the displacement inline, which
      // needs `await`. Throwing steers the caller to the awaitable port rather
      // than silently skipping the write. Callers use
      // `await owner.set#{Name}(value)` (the `set${cap}` port above) or
      // `await record.association(name).writer(value)` (RFC 0068).
      set(this: { association(n: string): { syncWrite(v: unknown): void } }, value: unknown) {
        this.association(name).syncWrite(value);
      },
      configurable: true,
    });
  }

  static override validDependentOptions(): string[] {
    return [
      "destroy",
      "destroyAsync",
      "delete",
      "nullify",
      "restrictWithError",
      "restrictWithException",
    ];
  }

  static override defineCallbacks(model: any, reflection: any): void {
    super.defineCallbacks(model, reflection);
    const options = reflection.options ?? {};
    // Mirrors Rails AutosaveAssociation::AssociationBuilderExtension.build —
    // registered for every has_one regardless of the `autosave:` option.
    // The save callbacks gate on `options.autosave` internally; the validate
    // callback gates on `reflection.validate?` (true for `validate: true`).
    // Registered BEFORE the touch callbacks so the child is autosaved (and thus
    // persisted) before the after_create/after_update touch fires — mirrors
    // Rails, where has_one.rb's `define_callbacks` runs `super` (which wires
    // autosave) before `add_touch_callbacks`.
    addAutosaveAssociationCallbacks(model, reflection);
    if (options.touch) {
      this.addTouchCallbacks(model, reflection);
    }
  }

  static override addDestroyCallbacks(model: any, reflection: any): void {
    const options = reflection.options ?? {};
    if (!options.through) {
      super.addDestroyCallbacks(model, reflection);
    }
  }

  static override defineValidations(model: any, reflection: any): void {
    super.defineValidations(model, reflection);
    const options = reflection.options ?? {};
    if (options.required) {
      model.validatesPresenceOf(reflection.name, { message: "required" });
    }
  }

  static async touchRecord(record: any, name: string, touch: any): Promise<void> {
    let instance: any;
    if (typeof record.association === "function") {
      const assoc = record.association(name);
      instance = typeof assoc.loadTarget === "function" ? await assoc.loadTarget() : assoc.target;
    } else {
      instance = typeof record[name] === "function" ? record[name]() : record[name];
    }

    // Mirrors Rails `HasOne.touch_record`: `touch != true ? instance.touch(touch)
    // : instance.touch`. The owner is touched immediately via `instance.touch`
    // (unlike `BelongsTo.touch_record`, which defers with `touch_later`).
    if (instance && typeof instance.isPersisted === "function" && instance.isPersisted()) {
      if (typeof instance.touch !== "function") return;
      if (touch === true) {
        await instance.touch();
      } else {
        await instance.touch(touch);
      }
    }
  }

  static addTouchCallbacks(model: any, reflection: any): void {
    const name = reflection.name ?? reflection;
    const touch = reflection.options?.touch;

    const callback = async (record: any) => {
      await HasOne.touchRecord(record, name, touch);
    };

    // Mirrors Rails `HasOne.add_touch_callbacks`: the create/update touch fires
    // only when the owner actually saved changes (`if: :saved_changes?`). Reuse
    // the existing `isSavedChanges` predicate (matches belongs-to.ts's touch
    // callback) so a no-op `save` on an unchanged owner does not re-touch.
    const savedChangesQ = (record: any) =>
      typeof record.isSavedChanges === "function" && record.isSavedChanges();

    afterCreate(model, callback, { if: savedChangesQ });
    // Mirrors Rails `after_create_commit { association(name).reset_negative_cache }`:
    // once the create transaction commits, drop the negative (nil) target cache
    // so a subsequent read re-queries and sees the freshly persisted child.
    afterCreateCommit(model, async (record: any) => {
      record.association(name).resetNegativeCache();
    });
    afterUpdate(model, callback, { if: savedChangesQ });
    afterDestroy(model, async (record: any) => {
      if (typeof record.isNewRecord !== "function" || !record.isNewRecord()) {
        await HasOne.touchRecord(record, name, touch);
      }
    });
    if (typeof model.afterTouch === "function") {
      model.afterTouch(async (record: any) => {
        if (record._touchingAssociations) return;
        record._touchingAssociations = true;
        try {
          await HasOne.touchRecord(record, name, touch);
        } finally {
          record._touchingAssociations = false;
        }
      });
    }
  }
}

/**
 * Run `association.build` with the association's own displaced-record removal
 * suppressed: this accessor awaits `detachDisplacedTarget` itself (with Rails'
 * target-on-failure semantics), and a second, concurrent removal of the same
 * row would double-destroy it. `HasOneAssociation#build` keeps the removal for
 * the direct `record.association(name).build(...)` callers, which have no other
 * hook to run it from.
 *
 * @internal
 */
function buildOwningDisplacement(assoc: any, args: unknown[]): any {
  assoc.buildDisplacementOwnedByCaller = true;
  try {
    return assoc.build(...args);
  } finally {
    assoc.buildDisplacementOwnedByCaller = false;
  }
}
