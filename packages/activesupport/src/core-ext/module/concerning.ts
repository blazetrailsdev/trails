import { Module, extend, include } from "@blazetrails/ruby-compat";
import { prepend as prependModule } from "@blazetrails/ruby-compat/include";
import { Concern } from "../../concern.js";

type AnyClass = abstract new (...args: any[]) => any;

export function concerning(
  this: AnyClass,
  topic: string,
  { prepend = false }: { prepend?: boolean } = {},
  block: (this: Module, mod: Module) => void,
): void {
  const method = prepend ? prependModule : include;
  method(this, concern.call(this, topic, block));
}

export function concern(
  this: AnyClass,
  topic: string,
  moduleDefinition: (this: Module, mod: Module) => void,
): Module {
  const mod = new Module();
  extend(mod, Concern);
  moduleDefinition.call(mod, mod);
  Object.defineProperty(this, topic, { value: mod, writable: true, configurable: true });
  return mod;
}
