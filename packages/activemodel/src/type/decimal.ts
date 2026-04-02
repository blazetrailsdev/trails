import { Type } from "./value.js";

export class DecimalType extends Type<string> {
  readonly name = "decimal";

  cast(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    const n = Number(value);
    return isNaN(n) ? null : n.toString();
  }

  type(): string {
    return this.name;
  }

  typeCastForSchema(value: unknown): string {
    return JSON.stringify(value) ?? String(value);
  }
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
