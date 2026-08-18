/**
 * Attribute writing methods.
 *
 * The actual writeAttribute implementation lives on Model (from
 * @blazetrails/activemodel), with Base adding encryption and frozen
 * checks. This module exists to match the Rails file structure for
 * ActiveRecord::AttributeMethods::Write.
 *
 * Mirrors: ActiveRecord::AttributeMethods::Write
 */

import { Model, AttrNames, buildMangledName } from "@blazetrails/activemodel";
import type { CodeGenerator } from "@blazetrails/activesupport";

/**
 * The Write module interface.
 *
 * Mirrors: ActiveRecord::AttributeMethods::Write
 */
export interface Write {
  writeAttribute(name: string, value: unknown): void;
  _writeAttribute(name: string, value: unknown): void;
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
export function _writeAttribute(this: Model, name: string, value: unknown): void {
  Model.prototype._writeAttribute.call(this, name, value);
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
  const tempMethodName = buildMangledName(methodName);
  owner.defineCachedMethod(
    tempMethodName,
    { namespace: "active_record", as: `${as}=` },
    (batch) => {
      batch.push((mod) => {
        Object.defineProperty(mod, tempMethodName, {
          value: function (this: Model, value: unknown) {
            this._writeAttribute(canonicalName, value);
          },
          writable: true,
          configurable: true,
        });
      });
    },
  );
}
