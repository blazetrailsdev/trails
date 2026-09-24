// `@blazetrails/activesupport/yaml` uses top-level await — incompatible with Rollup IIFE format.
export { parse, stringify } from "yaml";

export class DisallowedClass extends globalThis.Error {
  constructor(action: string, klassName: string) {
    super(`Tried to ${action} unspecified class: ${klassName}`);
    this.name = "Psych::DisallowedClass";
  }
}
