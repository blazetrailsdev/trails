import { ArgumentError } from "../attribute-assignment.js";
import { ValueType } from "./value.js";

export type TypeOptions = { precision?: number; scale?: number; limit?: number } & Record<
  string,
  unknown
>;
export type TypeFactory = (name: string, ...args: unknown[]) => ValueType;
export type TypeClass = new (...args: never[]) => ValueType;

export class TypeRegistry {
  /** @internal */
  protected registrationsMap: Map<string, TypeFactory>;

  constructor() {
    this.registrationsMap = new Map();
  }

  register(typeName: string, klass: TypeClass | null = null, block?: TypeFactory): void {
    if (block === undefined) {
      block = (_: string, ...args: unknown[]) => new klass!(...(args as never[]));
    }
    this.registrations.set(typeName, block);
  }

  lookup(symbol: string, ...args: unknown[]): ValueType {
    const registration = this.registrations.get(symbol);

    if (registration) {
      return registration(symbol, ...args);
    } else {
      throw new ArgumentError(`Unknown type :${symbol}`);
    }
  }

  /** @internal */
  protected get registrations(): Map<string, TypeFactory> {
    return this.registrationsMap;
  }
}

/** @noRailsEquivalent PERMANENT */
export const typeRegistry = new TypeRegistry();
