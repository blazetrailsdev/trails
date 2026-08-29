import type { AttributeSet } from "@blazetrails/activemodel";
import { AttrNames, AttributeMethods } from "@blazetrails/activemodel";
import type { CodeGenerator } from "@blazetrails/activesupport";

export interface Read {
  readAttribute(name: string): unknown;
  _readAttribute(name: string): unknown;
  /** @internal */
  attribute(name: string): unknown;
}

interface AttributeHolder {
  _attributes: AttributeSet;
}

export const Read = {
  readAttribute,
  _readAttribute,
  attribute: _readAttribute,
};

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

export function _readAttribute(
  this: AttributeHolder,
  attrName: string,
  block?: (name: string) => unknown,
): unknown {
  return this._attributes.fetchValue(attrName, block) ?? null;
}

/** @internal */
export function defineMethodAttribute(
  this: unknown,
  canonicalName: string,
  { owner, as = canonicalName }: { owner: CodeGenerator; as?: string },
): void {
  const { methodName } = AttrNames.defineAttributeAccessorMethod(owner, canonicalName);
  const tempMethodName = AttributeMethods.ClassMethods.buildMangledName(methodName);
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

/** @internal */
function readGeneratedAttribute(record: ReadRecord, canonicalName: string): unknown {
  return record._readAttribute(canonicalName, (n) => record.missingAttribute(n));
}

/** @noRailsEquivalent PERMANENT */
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
