import { parse as yamlParse, stringify as yamlStringify } from "@blazetrails/activesupport/yaml";
import { useYamlUnsafeLoad, yamlColumnPermittedClasses } from "../ar-config.js";
import { ColumnSerializer } from "./column-serializer.js";

type ClassLike = new (...args: unknown[]) => unknown;

/**
 * Mirror of `Psych::DisallowedClass` — raised when `safe_dump` (or
 * `safe_load`) encounters a class instance outside the permitted set. Rails
 * hits this when an arbitrary object reaches a YAML column's coder, e.g. an
 * encryption previous-scheme `AdditionalValue` reaching `Serialized#serialize`
 * during extended deterministic query expansion — the raise fires before any
 * payload exists, so no scheme/key material can leak into a dumped candidate.
 */
export class DisallowedClass extends globalThis.Error {
  constructor(action: string, klassName: string) {
    super(`Tried to ${action} unspecified class: ${klassName}`);
    this.name = "Psych::DisallowedClass";
  }
}

/**
 * Inner coder that does the raw YAML encode/decode. Rails wraps Psych's
 * safe_load/safe_dump with permitted-classes / unsafe-load options. The
 * safe_load side has no analog in trails (the `yaml` package only ever
 * produces plain JS values), so `load` degenerates to a plain parse — but the
 * safe_dump side does: dumping a class instance that isn't in the permitted
 * set raises `Psych::DisallowedClass`, exactly like Psych's `safe_dump`.
 * `ActiveRecord.use_yaml_unsafe_load` switches to the unrestricted dump, like
 * Rails' `::YAML.dump` branch.
 *
 * Mirrors: ActiveRecord::Coders::YAMLColumn::SafeCoder
 *
 * @internal
 */
class SafeCoder {
  constructor(
    private readonly permittedClasses: unknown[] = [],
    private readonly unsafeLoad: boolean | null = null,
  ) {}

  dump(object: unknown): string {
    if (!(this.unsafeLoad ?? useYamlUnsafeLoad)) this.assertDumpable(object);
    return yamlStringify(object, { directives: true });
  }

  load(payload: unknown): unknown {
    // Mirrors Rails' `YAML.load(payload)` — pass the raw payload straight through.
    // `yaml.parse("")` already yields null, so blank columns degrade to null.
    // ColumnSerializer.load guards null/undefined and store columns are text, so a
    // non-string never reaches here; like Rails (which raises on a non-String/IO
    // argument) we don't silently coerce bad input.
    return yamlParse(payload as string);
  }

  /**
   * Psych `safe_dump` visitor analog: scalars, arrays, and plain hashes are
   * always dumpable; any other object must be an instance of a permitted
   * class (`permitted_classes` + `ActiveRecord.yaml_column_permitted_classes`)
   * or the dump raises `Psych::DisallowedClass`.
   */
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
    for (const permitted of [...this.permittedClasses, ...yamlColumnPermittedClasses]) {
      if (typeof permitted === "function" && value instanceof permitted) return;
    }
    throw new DisallowedClass("dump", value.constructor?.name ?? "Object");
  }
}

/**
 * Coder that serializes/deserializes store columns using YAML. Selected by
 * `store(model, attr, { coder: "YAML" })` (the trails analog of Ruby's
 * `coder: YAML`).
 *
 * Mirrors: ActiveRecord::Coders::YAMLColumn (`:nodoc:`)
 *
 * Rails' YAMLColumn also overrides `check_arity_of_constructor` (to re-raise a
 * YAML-specific ArgumentError) and adds `init_with`/`coder` for Marshal
 * forward-compat. Both are omitted: the base ColumnSerializer already runs the
 * 0-arg-constructor check in its ctor, and store() only ever selects this coder
 * with the default `objectClass = Object`, so the override path is unreachable
 * here; Marshal-format migration has no JS analog.
 *
 * @internal
 */
export class YAMLColumn extends ColumnSerializer {
  constructor(
    attrName: string,
    objectClass: ClassLike = Object as unknown as ClassLike,
    { permittedClasses = [], unsafeLoad = null }: YamlColumnOptions = {},
  ) {
    super(attrName, new SafeCoder(permittedClasses ?? [], unsafeLoad), objectClass);
  }
}

/**
 * The `yaml:` option set Rails' `serialize` forwards into the YAMLColumn ctor
 * (`**(yaml || {})`, serialization.rb:215) — camelCase analogs of Psych's
 * `permitted_classes:` / `unsafe_load:` keywords.
 */
export interface YamlColumnOptions {
  permittedClasses?: unknown[];
  unsafeLoad?: boolean | null;
}
