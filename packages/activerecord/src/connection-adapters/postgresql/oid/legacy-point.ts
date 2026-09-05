import { ValueType } from "@blazetrails/activemodel";

export class LegacyPoint extends ValueType<[number, number]> {
  override type(): string {
    return "point";
  }

  cast(value: unknown): [number, number] | null {
    if (value == null) return null;
    if (globalThis.Array.isArray(value) && value.length === 2) {
      return [Number(value[0]), Number(value[1])];
    }
    if (typeof value === "string") {
      if (value === "") return null;
      return this.parsePoint(value);
    }
    return null;
  }

  serialize(value: unknown): string | null {
    if (value == null) return null;
    if (globalThis.Array.isArray(value) && value.length === 2) {
      return `(${this.numberForPoint(value[0])},${this.numberForPoint(value[1])})`;
    }
    if (typeof value === "string") return value;
    return null;
  }

  deserialize(value: unknown): [number, number] | null {
    return this.cast(value);
  }

  private numberForPoint(number: unknown): string {
    const s = String(number);
    return s.endsWith(".0") ? s.slice(0, -2) : s;
  }

  private parsePoint(str: string): [number, number] | null {
    const cleaned = str.replace(/[()]/g, "").trim();
    const parts = cleaned.split(",").map((s) => s.trim());
    if (parts.length !== 2) return null;
    const x = parseFloat(parts[0]);
    const y = parseFloat(parts[1]);
    if (isNaN(x) || isNaN(y)) return null;
    return [x, y];
  }
}
