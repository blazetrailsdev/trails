import { classModule, registerConstant } from "@blazetrails/ruby-compat";
import { afterEach } from "vitest";

export class JobBuffer {
  declare static _values: unknown[];

  static readonly [classModule] = true;

  static toString(): string {
    return "JobBuffer";
  }

  static clear() {
    return ((x) => (Array.isArray(x) ? (x.length = 0) : x.clear(), x))(this.values());
  }

  static add(value: unknown) {
    return ((x) =>
      typeof x === "string"
        ? x + value
        : Array.isArray(x)
          ? (x.push(value), x)
          : x instanceof globalThis.Set
            ? x.add(value)
            : x.append(value))(this.values());
  }

  static values() {
    if (!(this._values != null && this._values !== false)) this._values = [];
    return this._values;
  }

  static lastValue() {
    return this.values().at(-1);
  }
}
registerConstant("JobBuffer", JobBuffer);
afterEach(async ({ testCase }) => {
  JobBuffer.clear();
});
