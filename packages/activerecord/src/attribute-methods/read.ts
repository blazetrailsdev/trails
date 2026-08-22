/**
 * Attribute reading methods.
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
 * Returns the value of the attribute identified by `attrName` after it has
 * been type cast.
 *
 * Rails marks the read on the Attribute itself, inside `fetch_value`
 * (activemodel/attribute.rb:41-44), so `read_attribute` (read.rb:33) feeds
 * `accessed_fields` (attribute_methods.rb:460) like every other read path.
 * trails keeps that marker on the record, so each public read path sets it
 * itself — see {@link readGeneratedAttribute}, and the
 * `converge-accessed-fields-onto-attribute-set-accessed` story for why the
 * marker cannot yet move to the Attribute.
 *
 * Mirrors: ActiveRecord::AttributeMethods::Read#read_attribute (read.rb:29-34)
 */
export function readAttribute(
  this: ReadAttributeHost,
  attrName: string,
  block?: (name: string) => unknown,
): unknown {
  const name = (
    this.constructor as unknown as { resolveAttributeName(n: string): string }
  ).resolveAttributeName(String(attrName));

  return this._readAttribute(name, block);
}

interface ReadAttributeHost {
  _attributes: AttributeSet;
  _readAttribute(name: string, block?: (name: string) => unknown): unknown;
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
  completeHalfAccessor(this, as, "get", function (this: ReadRecord) {
    return readGeneratedAttribute(this, canonicalName);
  });
  owner.defineCachedMethod(tempMethodName, { namespace: "active_record", as }, (batch) => {
    batch.push((mod) => {
      Object.defineProperty(mod, tempMethodName, {
        get(this: ReadRecord) {
          return readGeneratedAttribute(this, canonicalName);
        },
        set(this: { writeAttribute(n: string, v: unknown): void }, value: unknown) {
          this.writeAttribute(canonicalName, value);
        },
        configurable: true,
      });
    });
  });
}

interface ReadRecord {
  _attributes: AttributeSet;
  _readAttribute(n: string, block: (n: string) => unknown): unknown;
  missingAttribute(n: string, stack?: string): never;
}

/**
 * The body of the generated reader (read.rb:18-20).
 *
 * @internal Rails-private helper.
 */
function readGeneratedAttribute(record: ReadRecord, canonicalName: string): unknown {
  return record._readAttribute(canonicalName, (n) => record.missingAttribute(n));
}

/**
 * A Ruby class that defines only `color=` (test/models/bulb.rb:27-29) still gets
 * the generated `color` reader, because the two are separate methods. A JS
 * accessor property is ONE descriptor for both halves, so the class's own
 * `set color` shadows the generated module's reader as well as its writer —
 * completing the class's half-descriptor with the generated half is what keeps
 * the Rails behaviour.
 *
 * @noRailsEquivalent PERMANENT — a JS accessor property is one descriptor for
 * both halves, so a class's own half-accessor shadows the generated module's
 * whole property; no port can split it back into Ruby's two methods. The
 * repo-wide consequence is ratified in CLAUDE.md ("Generated attribute readers
 * are properties").
 */
export function completeHalfAccessor(
  klass: unknown,
  name: string,
  half: "get" | "set",
  fn: (this: never, ...args: never[]) => unknown,
): void {
  const proto = (klass as { prototype?: object }).prototype;
  if (proto == null) return;
  const desc = Object.getOwnPropertyDescriptor(proto, name);
  if (desc == null || "value" in desc || desc[half] != null) return;
  Object.defineProperty(proto, name, { ...desc, [half]: fn, configurable: true });
}
