import { Time } from "@blazetrails/date";
import { Module, isPlainObject } from "@blazetrails/activesupport";
import { isUtc } from "./timezone.js";

export interface InstanceMethods<T = unknown> {
  serialize(value: unknown): unknown;
  serializeCastValue(value: T | null): unknown;
  cast(value: unknown): T | null;
  assertValidValue(value: unknown): void;
  isValueConstructedByMassAssignment(value: unknown): boolean;
  /** @internal */
  valueFromMultiparameterAssignment(valuesHash: Record<string, unknown>): T | null;
}

function superOf(
  receiver: object,
  name: string,
  self: unknown,
): (this: unknown, ...args: unknown[]) => unknown {
  let owner: object | null = null;
  for (
    let link: object | null = Object.getPrototypeOf(receiver);
    link;
    link = Object.getPrototypeOf(link)
  ) {
    if (Object.getOwnPropertyDescriptor(link, name)?.value === self) owner = link;
  }
  return (Object.getPrototypeOf(owner!) as Record<string, (...args: unknown[]) => unknown>)[name];
}

type Receiver = InstanceMethods & { valueFromMultiparameterAssignment(value: unknown): unknown };

export const InstanceMethods = {
  serialize(this: Receiver, value: unknown): unknown {
    return this.serializeCastValue(this.cast(value));
  },

  serializeCastValue(this: Receiver, value: unknown): unknown {
    return value;
  },

  cast(this: Receiver, value: unknown): unknown {
    if (isPlainObject(value)) {
      return this.valueFromMultiparameterAssignment(value);
    } else {
      return superOf(this, "cast", InstanceMethods.cast).call(this, value);
    }
  },

  assertValidValue(this: Receiver, value: unknown): unknown {
    if (isPlainObject(value)) {
      return this.valueFromMultiparameterAssignment(value);
    } else {
      return superOf(this, "assertValidValue", InstanceMethods.assertValidValue).call(this, value);
    }
  },

  isValueConstructedByMassAssignment(this: Receiver, value: unknown): boolean {
    return isPlainObject(value);
  },
};

export class AcceptsMultiparameterTime extends Module {
  constructor({ defaults = {} }: { defaults?: Record<string, number> } = {}) {
    super();

    this.include(InstanceMethods);

    this.defineMethod(
      "valueFromMultiparameterAssignment",
      function (valuesHash: Record<string, unknown>): Time | null {
        for (const [k, v] of Object.entries(defaults)) {
          if (valuesHash[k] == null || valuesHash[k] === false) valuesHash[k] = v;
        }
        if (!truthy(valuesHash["1"]) || !truthy(valuesHash["2"]) || !truthy(valuesHash["3"])) {
          return null;
        }
        const values = Object.entries(valuesHash)
          .sort(([a], [b]) => Number(a) - Number(b))
          .map(([, v]) => v as number | string);
        return isUtc()
          ? Time.utc(...(values as [number, number, number]))
          : Time.local(...(values as [number, number, number]));
      },
    );
  }
}

function truthy(value: unknown): boolean {
  return value != null && value !== false;
}
