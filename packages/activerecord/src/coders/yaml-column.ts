import { parse as yamlParse, stringify as yamlStringify } from "@blazetrails/activesupport/yaml";
import { ActiveRecord } from "../ar-config.js";
import { ColumnSerializer } from "./column-serializer.js";

type ClassLike = new (...args: unknown[]) => unknown;

export class DisallowedClass extends globalThis.Error {
  constructor(action: string, klassName: string) {
    super(`Tried to ${action} unspecified class: ${klassName}`);
    this.name = "Psych::DisallowedClass";
  }
}

/** @internal */
class SafeCoder {
  constructor(
    private readonly permittedClasses: unknown[] = [],
    private readonly unsafeLoad: boolean | null = null,
  ) {}

  dump(object: unknown): string {
    if (!(this.unsafeLoad ?? ActiveRecord.useYamlUnsafeLoad)) this.assertDumpable(object);
    return yamlStringify(object, { directives: true });
  }

  load(payload: unknown): unknown {
    return yamlParse(payload as string);
  }

  private assertDumpable(value: unknown, seen = new Set<object>()): void {
    if (value === null || typeof value !== "object") return;
    if (seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      for (const element of value) this.assertDumpable(element, seen);
      return;
    }
    const proto = Object.getPrototypeOf(value);
    if (proto === Object.prototype || proto === null) {
      for (const element of Object.values(value)) this.assertDumpable(element, seen);
      return;
    }
    for (const permitted of [
      ...this.permittedClasses,
      ...ActiveRecord.yamlColumnPermittedClasses,
    ]) {
      if (typeof permitted === "function" && value instanceof permitted) return;
    }
    throw new DisallowedClass("dump", value.constructor?.name ?? "Object");
  }
}

/** @internal */
export class YAMLColumn extends ColumnSerializer {
  constructor(
    attrName: string,
    objectClass: ClassLike = Object as unknown as ClassLike,
    { permittedClasses = [], unsafeLoad = null }: YamlColumnOptions = {},
  ) {
    super(attrName, new SafeCoder(permittedClasses ?? [], unsafeLoad), objectClass);
  }
}

export interface YamlColumnOptions {
  permittedClasses?: unknown[];
  unsafeLoad?: boolean | null;
}
