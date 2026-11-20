import { constSet, extend, include, type TopLevelConstants } from "@blazetrails/ruby-compat";
import { prepend as prependModule } from "@blazetrails/ruby-compat/include";
import { Concern } from "../../concern.js";

type AnyClass = new (...args: never[]) => unknown;
type ModuleBody = Record<string, unknown>;

export function concerning(
  this: AnyClass,
  topic: string,
  { prepend = false }: { prepend?: boolean } = {},
  block: (this: ModuleBody, mod: ModuleBody) => void,
): void {
  const method = prepend ? prependModule : include;
  method(this, concern.call(this, topic, block));
}

export function concern(
  this: AnyClass | TopLevelConstants,
  topic: string,
  moduleDefinition: (this: ModuleBody, mod: ModuleBody) => void,
): ModuleBody {
  const mod: ModuleBody = {};
  extend(mod, Concern);
  moduleDefinition.call(mod, mod);
  return constSet(this, topic, mod);
}
