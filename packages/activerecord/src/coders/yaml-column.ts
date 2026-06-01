import { parse as yamlParse, stringify as yamlStringify } from "@blazetrails/activesupport/yaml";
import { ColumnSerializer } from "./column-serializer.js";

type ClassLike = new (...args: unknown[]) => unknown;

/**
 * Inner coder that does the raw YAML encode/decode. Rails wraps Psych's
 * safe_load/safe_dump with permitted-classes / unsafe-load options; those guard
 * against deserializing arbitrary Ruby objects and have no analog in trails
 * (the `yaml` package only ever produces plain JS values), so this degenerates
 * to a plain parse/stringify pair.
 *
 * Mirrors: ActiveRecord::Coders::YAMLColumn::SafeCoder
 *
 * @internal
 */
class SafeCoder {
  dump(object: unknown): string {
    return yamlStringify(object);
  }

  load(payload: unknown): unknown {
    // Mirrors Rails' `YAML.load(payload)` — pass the raw payload straight through.
    // `yaml.parse("")` already yields null, so blank columns degrade to null.
    // ColumnSerializer.load guards null/undefined and store columns are text, so a
    // non-string never reaches here; like Rails (which raises on a non-String/IO
    // argument) we don't silently coerce bad input.
    return yamlParse(payload as string);
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
  constructor(attrName: string, objectClass: ClassLike = Object as unknown as ClassLike) {
    super(attrName, new SafeCoder(), objectClass);
  }
}
