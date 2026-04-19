import { ValueType } from "./value.js";

export class DecimalType extends ValueType {
  readonly name: string = "decimal";

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
