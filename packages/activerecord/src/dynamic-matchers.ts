import { camelize } from "@blazetrails/activesupport";
import { _Base } from "./base-slot.js";

interface DynamicMatchersHost {
  name: string;
  columnsHash(): Record<string, unknown>;
  attributeAliases?: Record<string, string>;
  reflectOnAggregation?(aggregation: string): unknown;
}

function match(model: DynamicMatchersHost, name: string): string[] | null {
  if (!name.startsWith("findBy")) return null;
  const attrPart = name.slice(6);
  if (!attrPart) return null;
  const snakePart = attrPart
    .replace(/^./, (c) => c.toLowerCase())
    .replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
  return snakePart.split("_and_").map((name) => model.attributeAliases?.[name] ?? name);
}

function valid(model: DynamicMatchersHost, attributeNames: string[]): boolean {
  const columnsHash = model.columnsHash();
  return attributeNames.every(
    (name) =>
      columnsHash[name] != null || model.reflectOnAggregation?.(camelize(name, false)) != null,
  );
}

export function respondToMissing(this: DynamicMatchersHost, name: string): boolean {
  if ((this as unknown) === _Base) {
    return false;
  } else {
    const matched = match(this, name);
    return (matched !== null && valid(this, matched)) || false;
  }
}
