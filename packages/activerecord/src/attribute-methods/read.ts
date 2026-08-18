/**
 * Attribute reading methods.
 *
 * The actual readAttribute implementation lives on Model (from
 * @blazetrails/activemodel). This module exists to match the Rails
 * file structure for ActiveRecord::AttributeMethods::Read.
 *
 * Mirrors: ActiveRecord::AttributeMethods::Read
 */

import type { AttributeSet } from "@blazetrails/activemodel";
import { AttrNames, buildMangledName } from "@blazetrails/activemodel";
import type { CodeGenerator } from "@blazetrails/activesupport";

/**
 * The Read module interface.
 *
 * Mirrors: ActiveRecord::AttributeMethods::Read
 */
export interface Read {
  readAttribute(name: string): unknown;
  _readAttribute(name: string): unknown;
}

interface AttributeHolder {
  _attributes: AttributeSet;
}

/**
 * Reads directly from the attribute store, bypassing any model-level
 * overrides of `readAttribute` (e.g. alias resolution or the serialize.ts
 * patch). Used internally where the attribute name is already canonical.
 *
 * Rails' public `read_attribute` also resolves `"id"` to the primary-key
 * column name. That redirect will live in our AR-level `readAttribute`
 * override once implemented; `_readAttribute` intentionally skips it.
 *
 * Mirrors: ActiveRecord::AttributeMethods::Read#_read_attribute
 */
export function _readAttribute(
  this: AttributeHolder,
  name: string,
  block?: (name: string) => unknown,
): unknown {
  return this._attributes.fetchValue(name, block) ?? null;
}

/**
 * Mirrors: ActiveRecord::AttributeMethods::Read::ClassMethods private
 * #define_method_attribute (read.rb:11-22) — the reader hook
 * `define_attribute_method_pattern` dispatches the bare pattern through
 * (activemodel/attribute_methods.rb:333-335).
 *
 * Rails generates `def name; _read_attribute("name") { |n| missing_attribute(n,
 * caller) }; end`. A TS reader is an accessor property, so the generated
 * descriptor also carries the `set` half `define_method_attribute=`
 * (write.rb:15) would otherwise install: a `MethodSet` applies one descriptor
 * per generated name (code_generator.rb:32-36), and a set-only descriptor
 * applied second would drop the getter.
 *
 * Rails marks the attribute read on the Attribute itself, inside `fetch_value`
 * (activemodel/attribute.rb:44-47), which is what `accessed_fields`
 * (attribute_set.rb:38) reports; trails keeps that marker on the record, so the
 * generated reader is where it is set.
 *
 * @internal Rails-private helper.
 */
export function defineMethodAttribute(
  this: unknown,
  canonicalName: string,
  { owner, as = canonicalName }: { owner: CodeGenerator; as?: string },
): void {
  const { methodName } = AttrNames.defineAttributeAccessorMethod(owner, canonicalName);
  const tempMethodName = buildMangledName(methodName);
  owner.defineCachedMethod(tempMethodName, { namespace: "active_record", as }, (batch) => {
    batch.push((mod) => {
      Object.defineProperty(mod, tempMethodName, {
        get(this: {
          _attributes: AttributeSet;
          _accessedFields: Set<string>;
          _readAttribute(n: string, block: (n: string) => unknown): unknown;
          missingAttribute(n: string, stack?: string): never;
        }) {
          if (this._attributes.has(canonicalName)) this._accessedFields.add(canonicalName);
          return this._readAttribute(canonicalName, (n) => this.missingAttribute(n));
        },
        set(this: { writeAttribute(n: string, v: unknown): void }, value: unknown) {
          this.writeAttribute(canonicalName, value);
        },
        configurable: true,
      });
    });
  });
}
