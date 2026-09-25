import { camelize } from "@blazetrails/activesupport";
import { ActiveRecord } from "./namespaces.js";

interface DynamicMatchersHost {
  name: string;
  columnsHash(): Record<string, unknown>;
  attributeAliases?: Record<string, string>;
  reflectOnAggregation?(aggregation: string): unknown;
}

const matchers = [/^findBy([_a-zA-Z]\w*)$/, /^findBy([_a-zA-Z]\w*)Bang$/];

function match(model: DynamicMatchersHost, name: string): string[][] {
  return matchers.flatMap((pattern) => {
    const matched = pattern.exec(name);
    if (!matched) return [];
    const snakePart = matched[1]
      .replace(/^./, (c) => c.toLowerCase())
      .replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
    return [snakePart.split("_and_").map((name) => model.attributeAliases?.[name] ?? name)];
  });
}

function valid(model: DynamicMatchersHost, attributeNames: string[]): boolean {
  const columnsHash = model.columnsHash();
  return attributeNames.every(
    (name) =>
      columnsHash[name] != null || model.reflectOnAggregation?.(camelize(name, false)) != null,
  );
}

export function respondToMissing(this: DynamicMatchersHost, name: string): boolean {
  if ((this as unknown) === ActiveRecord.Base) {
    return false;
  } else {
    return match(this, name).some((attributeNames) => valid(this, attributeNames));
  }
}
