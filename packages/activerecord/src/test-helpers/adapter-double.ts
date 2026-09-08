import { AbstractAdapter } from "../connection-adapters/abstract-adapter.js";

export class AdapterDouble extends AbstractAdapter {
  static override readonly ADAPTER_NAME: string = "AdapterDouble";

  override async active(): Promise<boolean> {
    return true;
  }
}

export function adapterDouble<T extends object>(overrides: T = {} as T): AdapterDouble & T {
  const double = new AdapterDouble({});
  Object.defineProperties(double, Object.getOwnPropertyDescriptors(overrides));
  return double as AdapterDouble & T;
}
