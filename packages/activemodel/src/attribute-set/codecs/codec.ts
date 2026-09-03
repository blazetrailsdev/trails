import { Attribute } from "../../attribute.js";
import type { AttributeSet } from "../../attribute-set.js";
import { typeRegistry } from "../../type/registry.js";
import { defaultValue } from "../../type.js";
import type { Type } from "../../type/value.js";

/** @noRailsEquivalent PERMANENT */
export interface AttributeSetCoder {
  attributes?: AttributeSet;
  conciseAttributes?: Attribute[];
}

/** @noRailsEquivalent PERMANENT */
export interface AttributeSetEnvelope {
  v: 1;
  types: Record<string, string | null>;
  values: Record<string, unknown>;
  defaultAttributes?: string[];
}

/** @noRailsEquivalent PERMANENT */
export interface AttributeSetCodec {
  encode(coder: AttributeSetCoder): string;
  decode(input: string): AttributeSetCoder;
}

/** @noRailsEquivalent PERMANENT */
export class AttributeSetCodecError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AttributeSetCodecError";
  }
}

const warnedKeys = new Set<string>();

/** @noRailsEquivalent PERMANENT */
export function toEnvelope(coder: AttributeSetCoder): AttributeSetEnvelope {
  const envelope: AttributeSetEnvelope = { v: 1, types: {}, values: {} };
  const defaultAttributes: string[] = [];

  for (const attr of coder.conciseAttributes ?? []) {
    if (!attr.isInitialized()) {
      defaultAttributes.push(attr.name);
      continue;
    }
    envelope.types[attr.name] = attr.type?.name ?? null;
    envelope.values[attr.name] = attr.valueBeforeTypeCast;
  }
  if (defaultAttributes.length > 0) envelope.defaultAttributes = defaultAttributes;

  return envelope;
}

/** @noRailsEquivalent PERMANENT */
export function fromEnvelope(envelope: AttributeSetEnvelope): AttributeSetCoder {
  const conciseAttributes: Attribute[] = [];

  for (const [name, typeKey] of Object.entries(envelope.types)) {
    conciseAttributes.push(Attribute.fromUser(name, envelope.values[name], lookupType(typeKey)));
  }
  for (const name of envelope.defaultAttributes ?? []) {
    conciseAttributes.push(Attribute.uninitialized(name, null));
  }

  return { conciseAttributes };
}

function lookupType(typeKey: string | null): Type | null {
  if (typeKey == null) return null;
  try {
    return typeRegistry.lookup(typeKey);
  } catch {
    if (!warnedKeys.has(typeKey)) {
      warnedKeys.add(typeKey);
      console.warn(`unknown type key "${typeKey}" — falling back to "value" type`);
    }
    return defaultValue();
  }
}
