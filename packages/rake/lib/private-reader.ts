import { extend, included, rbClearMethodCache } from "@blazetrails/ruby-compat/include";

export const ClassMethods = {
  privateReader(this: { prototype: object }, ...names: string[]): void {
    for (const name of names) {
      Object.defineProperty(this.prototype, name, {
        get(this: Record<string, unknown>) {
          return this[`_${name}`] ?? null;
        },
        configurable: true,
      });
      rbClearMethodCache();
    }
  },
};

export const PrivateReader = {
  ClassMethods,
  [included](base: object): void {
    extend(base as never, ClassMethods);
  },
};
