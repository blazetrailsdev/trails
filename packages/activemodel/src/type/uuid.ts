import { Type } from "./value.js";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class UuidType extends Type<string> {
  readonly name = "uuid";

  cast(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    const str = String(value).toLowerCase();
    if (!UUID_REGEX.test(str)) return null;
    return str;
  }
}
