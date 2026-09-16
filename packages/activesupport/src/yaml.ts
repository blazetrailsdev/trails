import { LoadError } from "@blazetrails/ruby-compat";

const yaml = await import("yaml").catch(() => {
  const missing = (): never => {
    throw new LoadError("cannot load such file -- yaml");
  };
  return { parse: missing, stringify: missing } as unknown as typeof import("yaml");
});

export const parse: typeof import("yaml").parse = yaml.parse;
export const stringify: typeof import("yaml").stringify = yaml.stringify;

export class DisallowedClass extends globalThis.Error {
  constructor(action: string, klassName: string) {
    super(`Tried to ${action} unspecified class: ${klassName}`);
    this.name = "Psych::DisallowedClass";
  }
}
