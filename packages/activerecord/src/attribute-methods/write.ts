/**
 * Attribute writing methods.
 *
 * `writeAttribute` here is the base `Write#write_attribute`, reached from
 * `HasReadonlyAttributes#write_attribute` (readonly-attributes.ts) where Ruby
 * writes `super` (readonly_attributes.rb:54).
 *
 * Mirrors: ActiveRecord::AttributeMethods::Write
 */

import {
  type AttributeSet,
  Model,
  MissingAttributeError,
  AttrNames,
  AttributeMethods,
} from "@blazetrails/activemodel";
import { included, type CodeGenerator } from "@blazetrails/activesupport";
import { completeHalfAccessor } from "./read.js";

/**
 * The Write module interface.
 *
 * Mirrors: ActiveRecord::AttributeMethods::Write
 */
export interface Write {
  writeAttribute(name: string, value: unknown): void;
  _writeAttribute(name: string, value: unknown): void;
}

/** The host `include ActiveRecord::AttributeMethods::Write` needs. */
interface WriteIncludeHost {
  attributeMethodSuffix(...suffixes: Array<string | { parameters?: string | null | false }>): void;
}

/**
 * `ActiveRecord::AttributeMethods::Write` — the module whose `included do` block
 * (write.rb:9-11) declares the `=` writer pattern. Its instance methods are the
 * `this`-typed functions below (CLAUDE.md, "Module mixins"), so the module
 * object itself carries only the hook.
 *
 * Mirrors: ActiveRecord::AttributeMethods::Write
 */
export const Write = {
  [included](base: WriteIncludeHost): void {
    base.attributeMethodSuffix("=", { parameters: "value" });
  },
};

/** The `@attributes` bag `write_from_user` writes into (write.rb:36, :41). */
type WriteRecord = Model & Write & { _attributes: AttributeSet };

/**
 * Updates the attribute identified by `attrName` using the specified `value`.
 *
 * Mirrors: ActiveRecord::AttributeMethods::Write#write_attribute (write.rb:31-38)
 */
export function writeAttribute(this: WriteRecord, attrName: string, value: unknown): void {
  let name = (
    this.constructor as unknown as { resolveAttributeName(n: string): string }
  ).resolveAttributeName(String(attrName));

  // write.rb:35 — `name = @primary_key if name == "id" && @primary_key`, where
  // `@primary_key` is `klass.primary_key` (core.rb:844).
  // - Scalar custom PK: `@primary_key` is a string, so `id` remaps to the real
  //   PK column (a standard `id` PK remaps to itself, a no-op).
  // - Composite PK: `@primary_key` is the array, so Rails calls
  //   `write_from_user([...], v)`; the array key misses the attribute hash and
  //   resolves to a `Null` attribute → `MissingAttributeError` — even when the
  //   table has a real `id` column (e.g. cpk_books). Mirror that raise here
  //   rather than writing the scalar `id`. (Composite `id=` assignment flows
  //   through the per-column `_writeAttribute` path, not this one.)
  // The `_initializingAttributes` guard on that arm has no Rails counterpart:
  // during `new X(…)` it must stay quiet, because Ruby builds the attribute set
  // before any writer runs.
  const pk = (this.constructor as unknown as { primaryKey: string | string[] | null }).primaryKey;
  if (name === "id" && pk != null) {
    if (typeof pk === "string") {
      name = pk;
    } else if (!this._initializingAttributes) {
      // Rails calls `write_from_user(@primary_key, …)` with the PK array, so the
      // Null attribute's name — and the interpolated message (attribute.rb:236) —
      // is the array in Ruby `#inspect` form, e.g. `["author_id", "id"]`.
      const arrayName = `[${pk.map((c) => `"${c}"`).join(", ")}]`;
      throw new MissingAttributeError(`can't write unknown attribute \`${arrayName}\``);
    }
  }

  // write.rb:36 — `@attributes.write_from_user(name, value)`. Going through
  // `this._writeAttribute` would instead re-enter
  // `HasReadonlyAttributes#_write_attribute`, a guard Rails does not run twice.
  this._attributes.writeFromUser(name, value);
}

/**
 * Low-level attribute write — skips alias resolution and `"id"` → primary-key
 * remapping that `write_attribute` performs, but readonly enforcement is
 * applied by `ReadonlyAttributes._writeAttribute` (wired in base.ts),
 * matching Rails' `HasReadonlyAttributes#_write_attribute`.
 *
 * This function is the fallback used when `Base._writeAttribute` is not yet
 * available (e.g. during very early bootstrap). At runtime it is shadowed
 * by `ReadonlyAttributes._writeAttribute` on `Base.prototype`.
 *
 * Mirrors: ActiveRecord::AttributeMethods::Write#_write_attribute
 */
export function _writeAttribute(this: WriteRecord, name: string, value: unknown): void {
  // write.rb:41 — `@attributes.write_from_user(attr_name, value)`.
  this._attributes.writeFromUser(name, value);
}

/**
 * Mirrors: ActiveRecord::AttributeMethods::Write::ClassMethods private
 * #define_method_attribute= (write.rb:15-26) — the writer hook
 * `define_attribute_method_pattern` dispatches the `"="` suffix pattern
 * (write.rb:10) through (activemodel/attribute_methods.rb:333-335), generating
 * `def name=(value); _write_attribute("name", value); end`.
 *
 * Ruby's `name=` writer takes the `set*` spelling here
 * (docs/ruby-ts-conventions.md) because the bare camel name belongs to `Read`'s
 * `define_method_attribute` (read.rb:11), as it does in Ruby. The generated
 * method keeps Rails' own name, `"#{as}="`; a JS assignment reaches the `set`
 * half of that hook's accessor property instead, because a
 * `MethodSet` applies one descriptor per generated name
 * (activesupport/code_generator.rb:32-36) and a property cannot take its halves
 * from two.
 *
 * @internal Rails-private helper.
 */
export function setDefineMethodAttribute(
  this: unknown,
  canonicalName: string,
  { owner, as = canonicalName }: { owner: CodeGenerator; as?: string },
): void {
  const { methodName } = AttrNames.defineAttributeAccessorMethod(owner, canonicalName, {
    writer: true,
  });
  const tempMethodName = AttributeMethods.ClassMethods.buildMangledName(methodName);
  completeHalfAccessor(this, as, "set", function (this: WriteRecord, value: unknown) {
    this._writeAttribute(canonicalName, value);
  });
  owner.defineCachedMethod(
    tempMethodName,
    { namespace: "active_record", as: `${as}=` },
    (batch) => {
      batch.push((mod) => {
        Object.defineProperty(mod, tempMethodName, {
          value: function (this: WriteRecord, value: unknown) {
            this._writeAttribute(canonicalName, value);
          },
          writable: true,
          configurable: true,
        });
      });
    },
  );
}
